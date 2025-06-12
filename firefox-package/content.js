// 디버그 모드 설정 (false로 설정하여 로그 출력 비활성화)
const DEBUG_MODE = false;

// 강화된 전역 오류 핸들러 - 연결 오류 완전 억제
(function suppressAllConnectionErrors() {
    // 1. console.error 오버라이드
    const originalError = console.error;
    console.error = function(...args) {
        const errorMessage = args.join(' ');
        const isConnectionError = errorMessage.includes('Could not establish connection') ||
                                errorMessage.includes('Receiving end does not exist') ||
                                errorMessage.includes('Extension context invalidated') ||
                                errorMessage.includes('The message port closed before a response was received') ||
                                errorMessage.includes('Uncaught (in promise)');
        
        if (!isConnectionError) {
            originalError.apply(console, args);
        }
    };
    
    // 2. window.onerror 오버라이드
    const originalOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
        const isConnectionError = message && (
            message.includes('Could not establish connection') ||
            message.includes('Receiving end does not exist') ||
            message.includes('Extension context invalidated')
        );
        
        if (isConnectionError) {
            return true; // 에러 처리됨을 표시하여 브라우저 기본 처리 방지
        }
        
        if (originalOnError) {
            return originalOnError.call(this, message, source, lineno, colno, error);
        }
        return false;
    };
    
    // 3. unhandledrejection 이벤트 처리
    window.addEventListener('unhandledrejection', function(event) {
        const errorMessage = event.reason?.message || event.reason || '';
        const isConnectionError = typeof errorMessage === 'string' && (
            errorMessage.includes('Could not establish connection') ||
            errorMessage.includes('Receiving end does not exist') ||
            errorMessage.includes('Extension context invalidated')
        );
        
        if (isConnectionError) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }, true);
    
    // 4. 브라우저 DevTools 콘솔 오류도 억제
    if (typeof window.chrome !== 'undefined' && window.chrome.runtime) {
        const originalSendMessage = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = function(...args) {
            try {
                return originalSendMessage.apply(this, args);
            } catch (error) {
                const errorMessage = error.message || '';
                if (errorMessage.includes('Could not establish connection') ||
                    errorMessage.includes('Receiving end does not exist') ||
                    errorMessage.includes('Extension context invalidated')) {
                    // 연결 오류는 무시하고 조용히 처리
                    return;
                }
                throw error;
            }
        };
    }
})();

// 안전한 메시지 전송 함수
function safeSendMessage(message, callback, retryCount = 2) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        if (callback) callback(null);
        return;
    }
    
    function attemptSend(attempts) {
        if (attempts <= 0) {
            if (callback) callback(null);
            return;
        }
        
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message;
                    const isHarmlessError = errorMsg.includes('Extension context invalidated') || 
                                          errorMsg.includes('Receiving end does not exist') ||
                                          errorMsg.includes('Could not establish connection') ||
                                          errorMsg.includes('The message port closed before a response was received');
                    
                    if (isHarmlessError) {
                        // 초기 설치나 새로고침 시 발생하는 무해한 연결 오류는 조용히 처리
                        // 개발자 콘솔에 오류 로그를 남기지 않도록 더 긴 지연 후 재시도
                        const delay = attempts === retryCount ? 2000 : 1000; // 더 긴 지연으로 안정성 향상
                        if (attempts > 0) {
                            setTimeout(() => attemptSend(attempts - 1), delay);
                        } else {
                            // 모든 재시도 실패 시에도 조용히 처리 (무해한 오류이므로)
                            if (callback) callback(null);
                        }
                        return;
                    }
                    // 진짜 오류는 즉시 실패 처리
                    if (callback) callback(null);
                    return;
                }
                if (callback) callback(response);
            });
        } catch (error) {
            // 전송 자체가 실패한 경우 재시도
            setTimeout(() => attemptSend(attempts - 1), 500);
        }
    }
    
    attemptSend(retryCount);
}

// 전역 변수 정의
let bookmarkBar = null;
let preventAutoClose = false;
let isInitialized = false;
let contextInvalidated = false;
let recoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 5;
let reconnectTimer = null;
let checkContextTimer = null;
let lastSuccessfulContextCheck = 0;
let bookmarkBarVisible = false;
let bookmarkBarElement = null;
let clickPosition = { x: 0, y: 0 };
let bookmarkBarAutoCloseTimer = null; // 북마크바 자동 닫힘 타이머

// 성능 최적화를 위한 캐시 변수들
let settingsCache = null;
let bookmarkCache = null;
let customIconsCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 30000; // 30초 캐시 유지
let isContentReady = false;
let pendingActions = [];

const defaultSettings = {
    activationMethod: 'middleclick',
    hotkey: 'b',
    hotkeyModifier: 'alt',
    openInNewTab: true,
    focusNewTab: true,
    autoCloseAfterSelect: true,
    positionNearClick: true,
    bookmarkSortOrder: 'recent',
    bookmarkLayoutMode: 'circle',
    bookmarkAnimationMode: 'shoot',
    animationEnabled: true,
    showBookmarkTitles: true,
    theme: 'auto',
    mouseCloseMode: 'none',
    mouseCloseTimeout: 5,
    bookmarkHotkey: 'ctrl+shift+a' // 기본값을 Ctrl+Shift+A로 변경
};
let currentSettings = {...defaultSettings};
const BOOKMARK_BAR_ID = 'bookstaxx-bookmark-bar';
let responsiveSettings = null; // 반응형 크기 설정 저장

// ensureInitialization 함수를 최상단으로 이동
function ensureInitialization() {
    if (!isInitialized && !contextInvalidated) {
        if (DEBUG_MODE) console.log("지연된 초기화 시도...");
        // initializeBookStaxx가 이 시점에 정의되지 않았을 수 있으므로, 호출 전 확인
        if (typeof initializeBookStaxx === 'function') {
        initializeBookStaxx();
        } else {
            console.error("ensureInitialization: initializeBookStaxx is not defined when called.");
            // 이 경우, initializeBookStaxx가 정의된 후 다시 시도하도록 폴백 로직 고려 가능
            // 또는 initializeBookStaxx 자체를 ensureInitialization보다 먼저 정의
        }
    }
}

// --- 나머지 모든 함수 정의는 여기에 순서대로 위치 ---

// --- 코어 오류 처리 및 UI 복구 함수 --- 
function removeAllBookmarkElements() {
    try {
        // 닫힘 상태 먼저 설정
        bookmarkBarVisible = false;
        
        const container = document.getElementById(BOOKMARK_BAR_ID);
        if (container) {
            // 모든 자식 요소 제거
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            
            // 컨테이너 클래스 업데이트
            container.classList.remove('active');
            container.setAttribute('data-visible', 'false');
        }
        
        // 북마크 바 외부에 있을 수 있는 다른 bookstaxx 요소들도 제거
        const elementsToRemove = document.querySelectorAll('[data-bookstaxx-element="true"]:not(#' + BOOKMARK_BAR_ID + ')');
        elementsToRemove.forEach(el => {
            if (el.parentElement) {
                el.parentElement.removeChild(el);
            }
        });
        
        console.log("[removeAllBookmarkElements] 모든 북마크 요소 제거 완료");
    } catch (error) {
        console.error("북마크 요소 제거 중 오류:", error);
    }
}

function removeBookmarkBar() {
    try {
        console.log("[removeBookmarkBar] 북마크 바 제거 시작");
        
        // 먼저 상태 변수 설정 (가장 중요)
        bookmarkBarVisible = false;
        
        // 자동 닫기 타이머가 있으면 제거
        if (bookmarkBarAutoCloseTimer) {
            clearTimeout(bookmarkBarAutoCloseTimer);
            bookmarkBarAutoCloseTimer = null;
            console.log("[removeBookmarkBar] 자동 닫기 타이머 제거됨");
        }
        
        // 북마크 컨테이너와 요소 제거
        const container = document.getElementById(BOOKMARK_BAR_ID);
        if (container) {
            container.classList.remove('active');
            container.setAttribute('data-visible', 'false');
            
            // 내부 요소 제거
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            
            console.log("[removeBookmarkBar] 북마크 바 제거 완료 - 상태:", { 
                classes: container.className,
                dataVisible: container.getAttribute('data-visible')
            });
        } else {
            console.log("[removeBookmarkBar] 제거할 북마크 컨테이너가 존재하지 않음");
        }
        
        // 모든 북마크 요소 제거
        removeAllBookmarkElements();
    } catch (error) {
        console.error("[removeBookmarkBar] 북마크 바 제거 중 오류:", error);
        // 오류가 발생해도 상태만큼은 확실히 변경
        bookmarkBarVisible = false;
    }
}

function showErrorMessage(messageKey, substitutions) {
    const existingErrorMsg = document.querySelector('.bookstaxx-error-message');
    if (existingErrorMsg && document.body && document.body.contains(existingErrorMsg)) {
        document.body.removeChild(existingErrorMsg);
    }
    
    let localizedMessage = '';
    try {
        // 메시지 키가 직접 메시지인지 또는 메시지 키인지 확인
        if (messageKey && messageKey.includes(" ")) {
            // 공백이 있다면 이미 메시지임
            localizedMessage = messageKey;
            // 대체 값이 있으면 적용
            if (substitutions) {
                for (const key in substitutions) {
                    localizedMessage = localizedMessage.replace(`{${key}}`, substitutions[key]);
                }
            }
        } else {
            // 메시지 키로 처리
            localizedMessage = chrome.i18n.getMessage(messageKey, substitutions) || messageKey; 
        }
    } catch (e) {
        localizedMessage = messageKey; 
        console.warn(`Error getting message for key ${messageKey}:`, e);
    }
    
    const errorMsg = document.createElement('div');
    errorMsg.className = 'bookstaxx-error-message';
    errorMsg.textContent = localizedMessage;
    
    // 접근성 향상
    errorMsg.setAttribute('role', 'alert');
    errorMsg.setAttribute('aria-live', 'assertive');
    
    if(document.body) document.body.appendChild(errorMsg);
    else console.error("showErrorMessage: document.body not found");
    
    setTimeout(() => {
        if (document.body && document.body.contains(errorMsg)) {
            errorMsg.style.opacity = '0';
            errorMsg.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                if (document.body && document.body.contains(errorMsg)) {
                    document.body.removeChild(errorMsg);
                }
            }, 500);
        }
    }, 4000); // 오류 메시지는 좀 더 오래 표시
}

function removeContextNotification() {
    const notification = document.getElementById('bookstaxx-context-notification');
    if (notification && notification.parentElement) {
        notification.parentElement.removeChild(notification);
    }
}

function showContextInvalidatedNotification() {
    if (document.getElementById('bookstaxx-context-notification')) return;
    const currentHost = window.location.hostname;
    const isRestrictedSite = /youtube|netflix|google\.com/i.test(currentHost);
    if (isRestrictedSite && recoveryAttempts > 1) return; 

    const notificationBar = document.createElement('div');
    notificationBar.id = 'bookstaxx-context-notification';
    notificationBar.style.cssText = "position:fixed;top:0;left:0;width:100%;background-color:#ff9800;color:white;padding:8px;text-align:center;z-index:2147483647;font-family:sans-serif;font-size:14px;box-shadow:0 2px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;";
    try {
        notificationBar.textContent = chrome.i18n.getMessage('contextInvalidatedMsg') || "BookStaxx 확장 프로그램 연결이 끊겼습니다. 복구를 시도합니다...";
    } catch (e) {
        notificationBar.textContent = "BookStaxx 확장 프로그램 연결이 끊겼습니다. 복구를 시도합니다...";
    }

    const refreshButton = document.createElement('button');
    try {
        refreshButton.textContent = chrome.i18n.getMessage('refreshPageButton') || "페이지 새로고침";
    } catch (e) {
        refreshButton.textContent = "페이지 새로고침";
    }
    refreshButton.style.cssText = "margin-left:10px;padding:4px 8px;background-color:#4285f4;color:white;border:none;border-radius:4px;cursor:pointer;";
    refreshButton.onclick = () => window.location.reload();
    notificationBar.appendChild(refreshButton);

    const closeButton = document.createElement('span');
    closeButton.textContent = "×";
    closeButton.style.cssText = "float:right;margin-left:15px;margin-right:20px;cursor:pointer;font-weight:bold;font-size:20px;";
    closeButton.onclick = removeContextNotification;
    notificationBar.appendChild(closeButton);

    if(document.body) document.body.appendChild(notificationBar);
    else console.error("showContextInvalidatedNotification: document.body not found");
}

function updateRecoveryNotification() {
    const currentHost = window.location.hostname;
    const isRestrictedSite = /youtube|netflix|google\.com/i.test(currentHost);
    if (isRestrictedSite) return;

    const notification = document.getElementById('bookstaxx-context-notification');
    if (notification) {
        notification.style.backgroundColor = "#ff9800"; 
        let msgContent = `BookStaxx 확장 프로그램 연결을 복구 중입니다... (시도 ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS})`;
        try {
            msgContent = chrome.i18n.getMessage('contextRecoveryAttempt', [recoveryAttempts.toString(), MAX_RECOVERY_ATTEMPTS.toString()]) || msgContent;
        } catch (e) { /* use default */ }
        notification.textContent = msgContent;
    } else {
        if (typeof showContextInvalidatedNotification === 'function') showContextInvalidatedNotification(); 
    }
}

function scheduleNextRecoveryAttempt(isLongDelay = false) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delay = isLongDelay ? 60000 : Math.min(Math.pow(2, recoveryAttempts) * 1000, 30000);
    if (DEBUG_MODE) console.log(`${Math.round(delay / 1000)}초 후 다음 복구 시도 예정...`);
    if (typeof tryRecoverContext === 'function') {
        reconnectTimer = setTimeout(tryRecoverContext, delay);
    } else {
        console.error("scheduleNextRecoveryAttempt: tryRecoverContext is not defined at the moment of scheduling.");
    }
}

function onRecoverySuccess() {
    if (DEBUG_MODE) console.log("컨텍스트 복구 성공!");
    contextInvalidated = false;
    recoveryAttempts = 0;
    const notification = document.getElementById('bookstaxx-context-notification');
    if (notification) {
        notification.style.backgroundColor = "#4caf50";
        try {
            notification.textContent = chrome.i18n.getMessage('contextRecoverySuccess') || "BookStaxx 확장 프로그램 연결이 복구되었습니다.";
        } catch (e) {
            notification.textContent = "BookStaxx 확장 프로그램 연결이 복구되었습니다.";
        }
        setTimeout(removeContextNotification, 3000);
    }
    if (typeof registerEventListeners === 'function') registerEventListeners(); 
    if (typeof applyGlobalCustomCursor === 'function') applyGlobalCustomCursor(); 
    if (!isInitialized && typeof initializeBookStaxx === 'function') initializeBookStaxx(); 
}

function tryRecoverContext() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (DEBUG_MODE) console.log(`컨텍스트 복구 시도 중... (시도 ${recoveryAttempts + 1}/${MAX_RECOVERY_ATTEMPTS})`);

    const isIframe = window !== window.top;
    const currentHost = window.location.hostname;
    const isRestrictedSite = /youtube|netflix|google\.com/i.test(currentHost);

    if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        if (DEBUG_MODE) console.log("최대 복구 시도 횟수 초과.");
        if (isRestrictedSite || isIframe) return;
        const notification = document.getElementById('bookstaxx-context-notification');
        if (notification) {
            notification.style.backgroundColor = "#f44336";
            try {
                notification.textContent = chrome.i18n.getMessage('contextRecoveryFailed') || "BookStaxx 연결 복구 실패. 페이지를 새로고침하세요.";
            } catch (e) {
                notification.textContent = "BookStaxx 연결 복구 실패. 페이지를 새로고침하세요.";
            }
        }
        return;
    }
    recoveryAttempts++;
    if (!isRestrictedSite || recoveryAttempts <=1) updateRecoveryNotification();
    if (isRestrictedSite && recoveryAttempts > 1) { scheduleNextRecoveryAttempt(true); return; }
    if (isIframe) { scheduleNextRecoveryAttempt(true); return; }

    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: "ping", silent: true }, response => {
                if (!chrome.runtime.lastError && response && response.success) {
                    onRecoverySuccess();
                } else {
                    tryBackgroundReinitialize();
                }
            });
        } else {
            tryBackgroundReinitialize();
        }
    } catch (error) {
        scheduleNextRecoveryAttempt();
    }

    function tryBackgroundReinitialize() { 
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            try {
                const reinitData = { action: "reinitialize", recoveryAttempt: recoveryAttempts, isIframe, isRestrictedSite };
                chrome.runtime.sendMessage(reinitData, response => {
                    if (!chrome.runtime.lastError && response && response.success) {
                        onRecoverySuccess();
                    } else {
                        scheduleNextRecoveryAttempt();
                    }
                });
            } catch (reinitError) {
                console.error("재초기화 요청 중 오류:", reinitError);
                scheduleNextRecoveryAttempt();
            }
        } else {
             scheduleNextRecoveryAttempt();
        }
    }
}

function loadSplitBase64Data(keyPrefix) {
    return new Promise((resolve, reject) => {
        if (!keyPrefix) {
            resolve(''); 
            return;
        }
        try {
            chrome.storage.local.get(`${keyPrefix}_meta`, (result) => {
                if (chrome.runtime.lastError) {
                    resolve('');
                    return;
                }
                const metaData = result[`${keyPrefix}_meta`];
                if (!metaData) {
                    resolve(''); 
                    return;
                }
                const partKeys = [];
                for (let i = 0; i < metaData.totalParts; i++) {
                    partKeys.push(`${keyPrefix}_part${i}`);
                }
                chrome.storage.local.get(partKeys, (parts) => {
                    if (chrome.runtime.lastError) {
                        resolve('');
                        return;
                    }
                    try {
                        let fullData = '';
                        let missingPart = false;
                        for (let i = 0; i < metaData.totalParts; i++) {
                            const part = parts[`${keyPrefix}_part${i}`];
                            if (part) {
                                fullData += part;
                            } else {
                                missingPart = true;
                                break;
                            }
                        }
                        if (missingPart) resolve('');
                        else resolve(fullData);
                    } catch (processingError) {
                        resolve('');
                    }
                });
            });
        } catch (error) {
            resolve('');
        }
    });
}

function getCustomCursorSize(callback) {
    chrome.storage.sync.get(['mouseCursorSize'], (result) => {
        let cursorSize = 32; 
        if (result.mouseCursorSize) {
            switch (result.mouseCursorSize) {
                case 'large': cursorSize = 48; break;
                case 'xlarge': cursorSize = 64; break;
            }
        }
        if (callback) callback(cursorSize);
    });
}

function applyGlobalCustomCursor() {
    loadSplitBase64Data('mouseCursorIcon').then(cursorUrl => {
        if (cursorUrl) {
            try {
                getCustomCursorSize((cursorSize) => {
                    let styleElement = document.getElementById('bookstaxx-global-cursor');
                    if (!styleElement) {
                        styleElement = document.createElement('style');
                        styleElement.id = 'bookstaxx-global-cursor';
                        if (document.head) document.head.appendChild(styleElement);
                        else console.error("applyGlobalCustomCursor: document.head not found");
                    }
                    styleElement.textContent = `
                        html, html body, html body * {
                            cursor: url('${cursorUrl}') ${cursorSize/2} ${cursorSize/2}, auto !important;
                        }
                    `; 
                });
            } catch (error) {
            }
        } else {
            let styleElement = document.getElementById('bookstaxx-global-cursor');
            if (styleElement) {
                styleElement.textContent = '';
            }
        }
    }).catch(error => {
    });
}

function safelyTrySendMessage(message) {
    return new Promise((resolve, reject) => {
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
                return reject(new Error("chrome.runtime.sendMessage API를 사용할 수 없습니다."));
            }
            const timeoutId = setTimeout(() => reject(new Error("메시지 전송 타임아웃")), 5000);
            chrome.runtime.sendMessage(message, response => {
                clearTimeout(timeoutId);
                if (chrome.runtime.lastError) {
                    const errMsg = chrome.runtime.lastError.message;
                    if (errMsg && errMsg.includes('Extension context invalidated')) {
            contextInvalidated = true;
                        if (!message.silent && typeof showContextInvalidatedNotification === 'function') showContextInvalidatedNotification();
                        setTimeout(() => { if (typeof tryRecoverContext === 'function') tryRecoverContext(); }, 500);
                    }
                    return reject(new Error(errMsg || "알 수 없는 런타임 오류"));
                }
                resolve(response === undefined ? { success: true, emptyResponse: true } : response);
            });
        } catch (error) {
            reject(error);
        }
    });
}

function loadCustomButtonIcons() {
    return new Promise((resolve) => {
        const customIcons = { backButtonIcon: null, addButtonIcon: null }; 
        const iconKeys = ['backButtonIcon', 'addButtonIcon'];
        let loadedCount = 0;
        if (iconKeys.length === 0) { 
            resolve(customIcons);
            return;
        }
        iconKeys.forEach(key => {
            loadSplitBase64Data(key)
                .then(dataUrl => {
                    if (dataUrl) customIcons[key] = dataUrl;
                })
                .catch(error => console.warn(`${key} 로드 오류:`, error))
                .finally(() => {
                    loadedCount++;
                    if (loadedCount === iconKeys.length) resolve(customIcons);
                });
        });
    });
}

function createCustomButton(options) {
    const { type, customIcon, defaultButtonSize, customButtonSize, mouseX, mouseY, screenWidth, screenHeight, buttonMargin, onClick } = options;
    
    try {
        // 컨테이너 참조 가져오기
        const bookmarkContainer = document.getElementById(BOOKMARK_BAR_ID) || ensureBookmarkContainer();

        // 버튼 기본 생성 로직
        const button = document.createElement('div');
        button.classList.add('bookstaxx-action-button');
        button.setAttribute('data-bookstaxx-element', 'true');
        
        if (type === 'back') {
            button.classList.add('bookstaxx-back-button');
        } else if (type === 'add') {
            button.classList.add('bookstaxx-add-button');
        }
        
        // 커스텀 아이콘이 있는 경우
        if (customIcon) {
            const customSize = customButtonSize || defaultButtonSize * 2;
            button.style.width = `${customSize}px`;
            button.style.height = `${customSize}px`;
            // 배경 이미지로 아이콘 설정
            button.style.backgroundImage = `url(${customIcon})`;
            button.style.backgroundSize = 'contain';
            button.style.backgroundPosition = 'center';
            button.style.backgroundRepeat = 'no-repeat';
        } else {
            // 커스텀 아이콘이 없는 경우에만 기본 아이콘 추가
            button.style.width = `${defaultButtonSize}px`;
            button.style.height = `${defaultButtonSize}px`;
            const iconElement = document.createElement('div');
            iconElement.classList.add('bookstaxx-action-icon');
            // 타입에 따라 아이콘 내용 설정
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgElement.setAttribute('viewBox', '0 0 24 24');
            svgElement.setAttribute('width', '36');
            svgElement.setAttribute('height', '36');
            
            const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            
            if (type === 'back') {
                svgElement.setAttribute('fill', '#4285f4');
                pathElement.setAttribute('d', 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z');
            } else if (type === 'add') {
                svgElement.setAttribute('fill', '#007AFF');
                pathElement.setAttribute('d', 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z');
            }
            
            svgElement.appendChild(pathElement);
            iconElement.appendChild(svgElement);
            button.appendChild(iconElement);
        }
        
        // 위치 계산 및 설정
        let posX = mouseX;
        let posY = mouseY;
        const buttonWidth = parseInt(button.style.width);
        const buttonHeight = parseInt(button.style.height);
        // 화면 경계 확인 및 조정
        if (posX - buttonWidth/2 < buttonMargin) posX = buttonMargin + buttonWidth/2;
        if (posX + buttonWidth/2 > screenWidth - buttonMargin) posX = screenWidth - buttonMargin - buttonWidth/2;
        if (posY - buttonHeight/2 < buttonMargin) posY = buttonMargin + buttonHeight/2;
        if (posY + buttonHeight/2 > screenHeight - buttonMargin) posY = screenHeight - buttonMargin - buttonHeight/2;
        button.style.left = `${posX - buttonWidth/2}px`;
        button.style.top = `${posY - buttonHeight/2}px`;
        // 클릭 이벤트
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (onClick) onClick();
        });
        // 문서에 버튼 추가 (이전: document.body.appendChild)
        if (bookmarkContainer) {
            bookmarkContainer.appendChild(button);
        } else {
            console.error("createCustomButton: 북마크 컨테이너를 찾을 수 없습니다.");
            document.body.appendChild(button); // 폴백
        }
        return button;
    } catch (error) {
        console.error("커스텀 버튼 생성 중 오류:", error);
        return null;
    }
}

function showDefaultBookmarkIcons(buttonSize, buttonMargin, buttonOffset, mouseX, mouseY, screenWidth, screenHeight) {
    createCustomButton({
        type: 'back', customIcon: null, defaultButtonSize: buttonSize, customButtonSize: buttonSize, 
        mouseX: mouseX - buttonOffset, mouseY, screenWidth, screenHeight, buttonMargin,
        onClick: () => { window.history.back(); removeBookmarkBar(); }
    });
    createCustomButton({
        type: 'add', customIcon: null, defaultButtonSize: buttonSize, customButtonSize: buttonSize, 
        mouseX: mouseX + buttonOffset, mouseY, screenWidth, screenHeight, buttonMargin,
        onClick: () => { addCurrentPageToBookmarks(); }
    });
}

function collectBookmarks(node, bookmarks = []) {
    try {
        if (node.url) {
            bookmarks.push(node);
        }
        if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
                collectBookmarks(child, bookmarks);
            }
        }
        return bookmarks;
    } catch (error) {
        console.error("북마크 수집 중 오류:", error);
        return bookmarks; 
    }
}

function ensureBookmarkContainer() {
    try {
        const containerId = BOOKMARK_BAR_ID;
        let container = document.getElementById(containerId);
        if (!container) {
            if (DEBUG_MODE) console.log("북마크 컨테이너 생성");
            container = document.createElement('div');
            container.id = containerId;
            container.className = 'bookstaxx-bookmark-bar';
            container.setAttribute('data-bookstaxx-element', 'true');
            container.setAttribute('role', 'dialog');
            container.setAttribute('aria-label', '북마크 메뉴');
            
            if (document.body) {
                document.body.appendChild(container);
            } else {
                console.error("ensureBookmarkContainer: document.body not found");
                return null;
            }

            // 항상 전체 화면 오버레이 스타일을 적용 (기존/신규 모두)
            if (container) {
                container.style.position = 'fixed';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100vw';
                container.style.height = '100vh';
                container.style.minWidth = '100vw';
                container.style.minHeight = '100vh';
                container.style.maxWidth = '100vw';
                container.style.maxHeight = '100vh';
                container.style.pointerEvents = 'none';
                container.style.background = 'transparent';
                container.style.border = 'none';
                container.style.boxShadow = 'none';
                container.style.overflow = 'visible';
            }
        }
        
        // 북마크바가 열릴 때만 active 클래스와 속성 추가
        if (bookmarkBarVisible) {
            container.classList.add('active');
            container.setAttribute('data-visible', 'true');
            console.log("[ensureBookmarkContainer] 컨테이너 활성화:", container.id, 
                        "display:", container.style.display,
                        "visibility:", container.style.visibility,
                        "classes:", container.className);
        } else {
            container.classList.remove('active');
            container.setAttribute('data-visible', 'false');
        }
        
        return container;
    } catch (error) {
        console.error("북마크 컨테이너 생성 중 오류:", error);
        return null;
    }
}

function preloadCustomIcons() {
    console.log("커스텀 아이콘 미리 로드 시도");
    const iconKeys = ['backButtonIcon', 'addButtonIcon', 'mouseCursorIcon'];
    const loadPromises = iconKeys.map(key => 
        loadSplitBase64Data(key)
            .then(dataUrl => {
                if (dataUrl) {
                    console.log(`${key} 미리 로드 성공: ${dataUrl.substring(0, 30)}...`);
                } else {
                    console.log(`${key} 미리 로드 실패: 데이터 없음`);
                }
                return { key, loaded: !!dataUrl, dataUrl };
            })
            .catch(error => {
                console.warn(`${key} 미리 로드 오류:`, error);
                return { key, loaded: false, error };
            })
    );
    Promise.all(loadPromises)
        .then(results => {
            console.log("모든 커스텀 아이콘 미리 로드 완료:", 
                results.map(r => `${r.key}: ${r.loaded ? '성공' : '실패'}`).join(', '));
        })
        .catch(error => {
            console.error("아이콘 미리 로드 중 오류:", error);
        });
}

// 캐시된 설정 로드 (성능 최적화)
function loadAppSettingsFromCache() {
    const now = Date.now();
    if (settingsCache && (now - lastCacheUpdate) < CACHE_DURATION) {
        if (DEBUG_MODE) console.log("캐시된 설정 사용");
        currentSettings = {...settingsCache};
        return Promise.resolve(currentSettings);
    }
    
    return new Promise((resolve) => {
        loadAppSettings().then(() => {
            settingsCache = {...currentSettings};
            lastCacheUpdate = now;
            resolve(currentSettings);
        });
    });
}

function loadAppSettings() {
    return new Promise((resolve) => {
        try {
            if (DEBUG_MODE) console.log("설정 로드 시작");
            if (contextInvalidated) {
                console.error("확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하거나 확장 프로그램을 재시작하세요.");
                resolve();
                return;
            }
            currentSettings = {...defaultSettings};
            chrome.runtime.sendMessage({ action: "getSettings" }, function(response) {
                if (chrome.runtime.lastError) {
                    const errorMessage = chrome.runtime.lastError.message || "알 수 없는 오류";
                    console.error("설정 로드 중 오류:", errorMessage);
                    if (errorMessage.includes('Extension context invalidated')) {
                        contextInvalidated = true;
                        console.error("확장 프로그램 컨텍스트가 무효화되었습니다. 페이지를 새로고침하세요.");
                    }
                    resolve();
                    return;
                }
                if (!response) {
                    console.error("설정 로드 실패: 응답 없음");
                    resolve();
                    return;
                }
                if (response.error) {
                    console.error("설정 로드 실패:", response.error);
                    resolve();
                    return;
                }
                if (response.settings) {
                    if (DEBUG_MODE) console.log("설정 응답 전체 데이터:", response);
                    Object.assign(currentSettings, response.settings);
                    if (DEBUG_MODE) {
                        console.log("maxBookmarks 설정값:", currentSettings.maxBookmarks, "타입:", typeof currentSettings.maxBookmarks);
                        console.log("bookmarkSortOrder 설정값:", currentSettings.bookmarkSortOrder);
                        console.log("bookmarkLayoutMode 설정값:", currentSettings.bookmarkLayoutMode);
                        console.log("bookmarkAnimationMode 설정값:", currentSettings.bookmarkAnimationMode);
                    }
                    if (!currentSettings.bookmarkAnimationMode) {
                        currentSettings.bookmarkAnimationMode = 'shoot'; 
                        if (DEBUG_MODE) console.log("bookmarkAnimationMode 기본값 설정:", currentSettings.bookmarkAnimationMode);
                    }
                    if (currentSettings.maxBookmarks !== undefined) {
                        if (typeof currentSettings.maxBookmarks === 'string') {
                            currentSettings.maxBookmarks = parseInt(currentSettings.maxBookmarks, 10);
                            if (DEBUG_MODE) console.log("변환된 maxBookmarks 값:", currentSettings.maxBookmarks, "타입:", typeof currentSettings.maxBookmarks);
                        }
                    } else {
                        currentSettings.maxBookmarks = 20;
                        if (DEBUG_MODE) console.log("maxBookmarks 기본값 설정:", currentSettings.maxBookmarks);
                    }
                    if (!currentSettings.bookmarkSortOrder) {
                        currentSettings.bookmarkSortOrder = 'recent';
                        if (DEBUG_MODE) console.log("bookmarkSortOrder 기본값 설정:", currentSettings.bookmarkSortOrder);
                    }
                    if (currentSettings.animationEnabled === undefined) {
                        currentSettings.animationEnabled = true;
                        if (DEBUG_MODE) console.log("animationEnabled 기본값 설정:", currentSettings.animationEnabled);
                    }
                    if (DEBUG_MODE) console.log("설정 로드 완료:", currentSettings);
                } else {
                    if (DEBUG_MODE) console.log("설정 로드됨 (기본 설정):", currentSettings);
                }
                resolve();
            });
        } catch (error) {
            console.error("설정 로드 중 오류:", error);
            resolve();
        }
    });
}

function registerEventListeners() {
    try {
        console.log("이벤트 리스너 등록 시작");
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousedown', handleDocumentClick);
        document.removeEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleDocumentClick, true); // 캡처 단계에서 우선 처리
        document.addEventListener('contextmenu', handleContextMenu, true);
        
        // 북마크바 전용 이벤트 설정
        setupBookmarkBarEvents();
        
        chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
            if (message && message.action === "updateCustomImageStatus") {
                console.log("커스텀 이미지 상태 업데이트 메시지 수신:", message.customStatus);
                sendResponse({success: true});
                return true;
            }
        });
        console.log("이벤트 리스너 등록 완료");
    } catch (error) {
        console.error("이벤트 리스너 등록 중 오류:", error);
    }
}

function handleKeyDown(event) {
    try {
        if (!currentSettings || typeof currentSettings !== 'object') {
            currentSettings = {...defaultSettings};
        }

        // 옵션에서 설정된 단축키만 작동하도록 수정
        if (currentSettings.bookmarkHotkey && currentSettings.bookmarkHotkey !== 'none') {
            const hotkeyCombination = currentSettings.bookmarkHotkey.toLowerCase();
            if (DEBUG_MODE) console.log(`[Keyboard Shortcut] 설정된 단축키: ${hotkeyCombination}, 현재 키: ${event.key}`);
            
            // Ctrl+Shift 조합 처리
            if (hotkeyCombination.startsWith('ctrl+shift+')) {
                const targetKey = hotkeyCombination.replace('ctrl+shift+', '');
                const currentKey = event.key.toLowerCase();
                
                // 기본 키 매칭 확인
                let isKeyMatch = currentKey === targetKey;
                
                // Ctrl+Shift+1,2의 경우 !@로도 작동하게 수정
                if (!isKeyMatch && event.ctrlKey && event.shiftKey) {
                    if (targetKey === '1' && (currentKey === '!' || event.key === '!')) {
                        isKeyMatch = true;
                    } else if (targetKey === '2' && (currentKey === '@' || event.key === '@')) {
                        isKeyMatch = true;
                    }
                }
                
                if (event.ctrlKey && event.shiftKey && isKeyMatch) {
                    if (DEBUG_MODE) console.log(`[Keyboard Shortcut] ${hotkeyCombination.toUpperCase()} 감지됨 - 북마크 바 토글`);
                    toggleBookmarkBar(event);
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
            
            // 다른 단축키 조합 처리 (기존 코드 유지)
            const RESERVED_KEYS = ['t','w','n','r','f','f5'];
            const hotkey = (currentSettings.hotkey && currentSettings.hotkey.toString()) ? currentSettings.hotkey.toString().toLowerCase() : 'b';
            if (!RESERVED_KEYS.includes(hotkey)) { // 브라우저 기본 단축키는 사용 안 함
                const hotkeyModifier = currentSettings.hotkeyModifier || 'alt';
                if (event.key) {
                    const isHotkeyPressed = event.key.toLowerCase() === hotkey;
                    let isModifierPressed = false;
                    switch (hotkeyModifier) {
                        case 'alt': isModifierPressed = event.altKey; break;
                        case 'ctrl': isModifierPressed = event.ctrlKey; break;
                        case 'shift': isModifierPressed = event.shiftKey; break;
                        case 'meta': isModifierPressed = event.metaKey; break;
                        case 'none': isModifierPressed = true; break;
                        default: isModifierPressed = event.altKey;
                    }
                    if (isHotkeyPressed && isModifierPressed) {
                        if (currentSettings.activationMethod === 'both' || currentSettings.activationMethod === 'hotkey') {
                            toggleBookmarkBar(event);
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                        }
                    }
                }
            }
        } else {
            // bookmarkHotkey가 'none'인 경우 키보드 단축키 비활성화
            if (DEBUG_MODE) console.log("[Keyboard Shortcut] 키보드 단축키가 비활성화됨 (설정값: none)");
            return;
        }
    } catch (error) {
        console.error("키보드 이벤트 처리 중 오류:", error);
    }
}

function handleDocumentClick(event) {
    try {
        const isLeftClick = event.button === 0;
        const isMiddleClick = event.button === 1;
        const isRightClick = event.button === 2;
        const isBookmarkBarElement = event.target.closest(`#${BOOKMARK_BAR_ID}`) !== null || event.target.id === BOOKMARK_BAR_ID;
        const isBookstaxxElement = event.target.getAttribute('data-bookstaxx-element') === 'true';
        
        console.log("[handleDocumentClick] 이벤트 발생", {
            isLeftClick,
            isMiddleClick,
            isRightClick,
            isBookmarkBarElement,
            isBookstaxxElement,
            bookmarkBarVisible,
            mouseCloseMode: currentSettings.mouseCloseMode
        });
        
        // 북마크바 열기: 항상 휠 클릭(가운데 버튼)만 허용
        if (isMiddleClick) {
            console.log("[handleDocumentClick] 휠 버튼 클릭 감지 - 북마크바 토글");
            event.preventDefault();
            event.stopPropagation();
            toggleBookmarkBar(event);
            return;
        }
        
        // 북마크바가 열려 있을 때 닫기 동작
        if (bookmarkBarVisible) {
            console.log("[handleDocumentClick] 북마크바 닫기 동작 체크: 현재 모드:", currentSettings.mouseCloseMode);
            
            // 마우스 제거 모드 - 모든 마우스 버튼(왼쪽/오른쪽/휠)
            if (currentSettings.mouseCloseMode === 'button') {
                if (!isBookmarkBarElement && !isBookstaxxElement && (isLeftClick || isRightClick || isMiddleClick)) {
                    console.log("[handleDocumentClick] 'button' 모드에서 마우스 버튼으로 북마크바 닫기");
                    removeBookmarkBar();
                    return;
                }
            } 
            // 마우스 제거 모드 - 휠 클릭(가운데 버튼)만
            else if (currentSettings.mouseCloseMode === 'wheel') {
                if (isMiddleClick) {
                    console.log("[handleDocumentClick] 'wheel' 모드에서 휠 클릭으로 북마크바 닫기");
                    removeBookmarkBar();
                    return;
                }
            } 
            // 마우스 제거 모드 - 시간차(이 모드는 클릭으로 닫지 않음)
            else if (currentSettings.mouseCloseMode === 'timeout') {
                // 시간차 모드에서는 클릭으로 닫지 않음 - 타임아웃으로만 닫힘
                console.log("[handleDocumentClick] 'timeout' 모드에서는 클릭으로 닫지 않음");
            } 
            // 기본 동작(mouseCloseMode가 'none'이거나 설정되지 않은 경우)
            else {
                if (!isBookmarkBarElement && !isBookstaxxElement && (isLeftClick || isRightClick)) {
                    console.log("[handleDocumentClick] 기본 모드에서 좌/우 클릭으로 북마크바 닫기");
                    removeBookmarkBar();
                    return;
                }
            }
        }
        
        // 북마크 바 토글(설정에 따라)
        if ((isLeftClick && (currentSettings.activationMethod === 'both' || currentSettings.activationMethod === 'leftclick')) ||
            (isRightClick && (currentSettings.activationMethod === 'both' || currentSettings.activationMethod === 'rightclick'))) {
            event.preventDefault();
            event.stopPropagation();
            toggleBookmarkBar(event);
            return;
        }
        
        if (preventAutoClose) {
            return;
        }
        
        clickPosition = { x: event.clientX, y: event.clientY };
    } catch (error) {
        console.error("마우스 클릭 이벤트 처리 중 오류:", error);
        if (typeof tryRecoverContext === 'function') tryRecoverContext(); 
    }
}

// 휠 이벤트로 북마크바 닫기 (mouseCloseMode === 'wheel'일 때만)
function handleBookmarkBarWheel(event) {
    if (bookmarkBarVisible && currentSettings.mouseCloseMode === 'wheel') {
        console.log("[handleBookmarkBarWheel] 휠 이벤트로 북마크바 닫기");
        
        // 강제로 북마크바 닫기 (전역 상태 확실하게 수정)
        bookmarkBarVisible = false;
        removeBookmarkBar();
    }
}

function handleContextMenu(event) {
    try {
        // 우클릭도 북마크 바 토글(설정에 따라)
        if (currentSettings.activationMethod === 'both' || currentSettings.activationMethod === 'rightclick') {
            event.preventDefault();
            event.stopPropagation();
            toggleBookmarkBar(event);
        }
    } catch (error) {
        console.error("우클릭 이벤트 처리 중 오류:", error);
        if (typeof tryRecoverContext === 'function') tryRecoverContext();
    }
}

function toggleBookmarkBar(event) {
    try {
        console.log("[toggleBookmarkBar] 시작");
        if (contextInvalidated) {
            console.log("[toggleBookmarkBar] 컨텍스트 무효화 상태, 복구 시도");
            if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in toggleBookmarkBar during invalidation");
            if (typeof showErrorMessage === 'function') showErrorMessage("contextInvalidatedMsg"); else console.error("showErrorMessage is not defined in toggleBookmarkBar during invalidation");
            return;
        }
        if (bookmarkBarVisible) {
            console.log("[toggleBookmarkBar] 북마크 바 이미 표시됨, 제거 실행");
            removeBookmarkBar();
            return;
        }
        if (event) {
            clickPosition = { x: event.clientX, y: event.clientY };
            console.log("[toggleBookmarkBar] 클릭 위치 기록:", clickPosition);
        }
        console.log("[toggleBookmarkBar] 북마크 바 생성 시작 (showBookmarkIcons 호출)");
        
        // 상태 변수 먼저 설정
        bookmarkBarVisible = true;
        
        // 컨테이너 생성/확인
        const container = ensureBookmarkContainer();
        if (container) {
            // active 클래스 추가
            container.classList.add('active');
            container.setAttribute('data-visible', 'true');
        }
        
        // 아이콘 표시 함수 호출
        showBookmarkIcons();
        
        setTimeout(() => {
            const icons = document.querySelectorAll('.bookstaxx-bookmark-icon');
            console.log(`[toggleBookmarkBar] showBookmarkIcons 호출 100ms 후: ${icons.length}개의 아이콘 DOM에서 발견됨.`);
            if (icons.length > 0) {
                const firstIcon = icons[0];
                const style = window.getComputedStyle(firstIcon);
                console.log("[toggleBookmarkBar] 첫 번째 아이콘 계산된 스타일:", {
                    display: style.display,
                    opacity: style.opacity,
                    visibility: style.visibility,
                    width: style.width,
                    height: style.height,
                    transform: style.transform,
                    left: style.left,
                    top: style.top
                });
            }
        }, 100);
        console.log("[toggleBookmarkBar] 완료 (showBookmarkIcons 호출 완료)");
    } catch (error) {
        console.error("[toggleBookmarkBar] 오류 발생:", error);
        if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in toggleBookmarkBar catch block");
    }
}

// 반응형 크기 계산 함수
function calculateResponsiveSize(totalBookmarks, screenWidth, screenHeight, layoutMode, requestedIconSize) {
    const availableArea = screenWidth * screenHeight;
    
    // 레이아웃별 최적 크기 계산
    let maxIconSize;
    switch (layoutMode) {
        case 'grid':
            // 격자형: 최대 8열로 제한된 촘촘한 격자를 고려한 크기 계산
            let gridCols;
            if (totalBookmarks <= 16) {
                gridCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(totalBookmarks))));
            } else if (totalBookmarks <= 40) {
                gridCols = 6;  // 6열 고정
            } else {
                gridCols = 8;  // 8열 고정 (최대값)
            }
            const gridRows = Math.ceil(totalBookmarks / gridCols);
            maxIconSize = Math.min(
                (screenWidth * 0.7) / gridCols,  // 더 촘촘하게 배치
                (screenHeight * 0.8) / gridRows,
                requestedIconSize
            );
            break;
        case 'fullscreen':
            // 전체화면: 화면을 균등 분할하여 최대 크기 계산
            const itemsPerRow = Math.ceil(Math.sqrt(totalBookmarks));
            maxIconSize = Math.min(
                (screenWidth * 0.8) / itemsPerRow,
                (screenHeight * 0.8) / itemsPerRow,
                requestedIconSize
            );
            break;
        case 'circle':
            // 원형 레이아웃을 위한 개선된 크기 계산 - 실제 배치와 동일한 90% 사용
            const maxRadius = Math.min(screenWidth, screenHeight) / 2 * 0.90;
            
            if (totalBookmarks <= 1) {
                maxIconSize = requestedIconSize;
            } else if (totalBookmarks <= 12) {
                // 단일 원에 배치하는 경우
                const circumference = 2 * Math.PI * (maxRadius * 0.6);
                const maxSizeForCircle = circumference / (totalBookmarks - 1) * 0.7; // 70% 사용하여 겹침 방지
                maxIconSize = Math.min(maxSizeForCircle, requestedIconSize);
            } else {
                // 다중 원에 배치하는 경우 - 더 적극적인 크기 조정
                // 북마크 수에 따른 링 수 예측 (더 정확한 계산)
                let estimatedRings;
                if (totalBookmarks <= 24) {
                    estimatedRings = 2;
                } else if (totalBookmarks <= 50) {
                    estimatedRings = 3;
                } else if (totalBookmarks <= 80) {
                    estimatedRings = 4;
                } else {
                    estimatedRings = 5; // 98개 북마크를 위한 5개 링
                }
                
                // 링 간격 계산 (더 타이트하게)
                const ringSpacing = maxRadius / (estimatedRings + 0.5);
                
                // 각 링에서 사용할 수 있는 최대 아이콘 크기 (더 작게)
                const maxSizeForRings = ringSpacing * 0.6; // 80%에서 60%로 줄임
                
                // 가장 큰 링(외곽)에서의 최대 크기 계산
                const outerRingRadius = maxRadius * 0.90;
                const outerCircumference = 2 * Math.PI * outerRingRadius;
                const estimatedItemsInOuterRing = Math.floor(totalBookmarks / estimatedRings);
                const maxSizeForOuterRing = outerCircumference / estimatedItemsInOuterRing * 0.5; // 70%에서 50%로 줄임
                
                // 사용자 편의성 우선: 북마크 수가 많을 때도 적당한 크기 유지
                let sizeReductionFactor = 1.0;
                if (totalBookmarks > 70) {
                    sizeReductionFactor = 0.9; // 70개 이상일 때 10% 축소로 줄임
                }
                if (totalBookmarks > 90) {
                    sizeReductionFactor = 0.8; // 90개 이상일 때 20% 축소로 줄임
                }
                
                maxIconSize = Math.min(
                    maxSizeForRings,
                    maxSizeForOuterRing,
                    requestedIconSize * sizeReductionFactor
                );
                
                // 최소 크기 보장하되 더 관대하게 (가독성 우선)
                maxIconSize = Math.max(24, maxIconSize);
            }
            break;
        case 'custom':
            // 커스텀 레이아웃: 화면 크기에 따라 아이콘 크기 조절
            // 전체 화면 대비 아이콘이 차지하는 비율을 고려
            const minDimension = Math.min(screenWidth, screenHeight);
            const iconPercentage = requestedIconSize / 1280; // 에디터 기준 너비 1280px
            
            // 화면이 작아질수록 아이콘도 비례하여 작아지도록 조정
            maxIconSize = Math.min(
                minDimension * iconPercentage * 2, // 화면 크기에 비례
                requestedIconSize // 요청된 크기를 초과하지 않음
            );
            
            // 최소 크기 보장 (너무 작아지지 않도록)
            maxIconSize = Math.max(16, maxIconSize);
            break;
        default:
            maxIconSize = requestedIconSize;
    }
    
    // 최소/최대 크기 제한
    const finalIconSize = Math.max(16, Math.min(maxIconSize, requestedIconSize));
    const shouldScale = finalIconSize < requestedIconSize;
    
    if (DEBUG_MODE) console.log(`[Responsive Size] 요청: ${requestedIconSize}px, 계산된 최적: ${maxIconSize.toFixed(1)}px, 최종: ${finalIconSize.toFixed(1)}px${shouldScale ? ' (축소됨)' : ''}`);
    
    // 개선된 폰트 크기 계산 - 사용자 설정 기반
    const userFontSize = parseInt(currentSettings.bookmarkFontSize, 10) || 12;
    let responsiveFontSize = userFontSize;
    
    // 심각한 축소 시에만 폰트 크기 조정
    if (shouldScale && finalIconSize < requestedIconSize * 0.7) {
        const fontScaleRatio = Math.max(0.8, finalIconSize / requestedIconSize);
        responsiveFontSize = Math.max(10, Math.round(userFontSize * fontScaleRatio));
    }

    return {
        iconSize: Math.round(finalIconSize),
        fontSize: Math.max(8, Math.min(24, responsiveFontSize)),
        scaled: shouldScale
    };
}

async function createPhysicsBookmarks(bookmarks, mouseClickX, mouseClickY, iconSize, config) {
    const physicsObjects = [];
    const totalBookmarks = bookmarks.length;
    const sortOrder = currentSettings.bookmarkSortOrder || 'recent';
    const layoutMode = currentSettings.bookmarkLayoutMode || 'circle';
    
    // 반응형 크기 계산
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const responsiveSize = calculateResponsiveSize(totalBookmarks, screenWidth, screenHeight, layoutMode, iconSize);
    const effectiveIconSize = responsiveSize.iconSize;
    
    if (DEBUG_MODE) console.log(`[Responsive Layout] 원본 아이콘 크기: ${iconSize}px → 반응형 크기: ${effectiveIconSize}px`);
    
    // 반응형 설정을 전역으로 저장
    responsiveSettings = responsiveSize;
    
    // 반응형 크기를 config에 반영
    iconSize = effectiveIconSize;
    
    // 사용자 설정 크기를 우선 사용하는 접근 방식
    let adjustedIconSize = iconSize; // 기본적으로 사용자 설정값 사용
    
    // 화면 크기 계산 - 북마크가 화면 밖으로 나가지 않도록 안전 여백 확보
    const safetyMargin = iconSize + 30; // 아이콘 크기 + 추가 안전 여백
    const availableRadius = Math.min(screenWidth - safetyMargin, screenHeight - safetyMargin) / 2 * 0.70; // 화면의 70% 활용으로 더 안전하게
    const availableArea = Math.PI * availableRadius * availableRadius;
    
    // 현재 설정으로 배치 시뮬레이션 (실제 겹침 확인)
    const titleHeight = currentSettings.showBookmarkTitles ? 20 : 0; // 제목 높이 고려
    const itemTotalSize = iconSize + titleHeight + 10; // 아이콘 + 제목 + 여백
    const requiredSpacing = itemTotalSize * 1.3; // 30% 여백
    const circumference = 2 * Math.PI * availableRadius;
    const maxItemsPerCircle = Math.floor(circumference / requiredSpacing);
    const requiredCircles = Math.ceil(totalBookmarks / maxItemsPerCircle);
    const maxPossibleRadius = availableRadius;
    const requiredRadius = requiredCircles * (itemTotalSize * 0.8); // 원간 간격
    
    // 실제로 겹칠 것으로 예상되는 경우에만 크기 축소
    if (requiredRadius > maxPossibleRadius && totalBookmarks > 20) {
        const scaleFactor = Math.max(0.75, maxPossibleRadius / requiredRadius); // 최소 75% 크기 보장
        adjustedIconSize = Math.max(24, iconSize * scaleFactor);
        console.log(`[Overlap Prevention] 겹침 예상으로 크기 조정: ${iconSize}px -> ${adjustedIconSize.toFixed(1)}px (factor: ${scaleFactor.toFixed(2)})`);
        console.log(`[Overlap Prevention] 계산 상세: 필요반경=${requiredRadius.toFixed(1)}, 최대반경=${maxPossibleRadius.toFixed(1)}, 북마크수=${totalBookmarks}`);
    } else {
        console.log(`[No Adjustment] 사용자 설정 크기 유지: ${iconSize}px (충분한 공간 확보)`);
        console.log(`[No Adjustment] 계산 상세: 필요반경=${requiredRadius.toFixed(1)}, 최대반경=${maxPossibleRadius.toFixed(1)}, 북마크수=${totalBookmarks}`);
    }
    
    let effectivePattern = layoutMode; 
    if (layoutMode === 'circle' && sortOrder !== 'custom') { 
        if (totalBookmarks <= 12) effectivePattern = 'circle';
        else effectivePattern = 'multiCircle';
    } else if (layoutMode === 'fullscreen' && sortOrder !== 'custom') {
        effectivePattern = 'fullscreen';
    } else if (sortOrder === 'custom') {
        effectivePattern = 'custom'; 
    }
    console.log(`북마크 ${totalBookmarks}개, 요청 정렬: ${sortOrder}, 요청 레이아웃: ${layoutMode}, 적용 패턴: ${effectivePattern}`);
    let customLayoutCoordinates = null;
    if (effectivePattern === 'custom') {
        try {
            const result = await new Promise((resolve, reject) => {
                chrome.storage.local.get('customBookmarkLayout', (data) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve(data);
                });
            });
            if (result && result.customBookmarkLayout && result.customBookmarkLayout.length > 0) {
                customLayoutCoordinates = result.customBookmarkLayout;
                console.log('커스텀 레이아웃 좌표를 성공적으로 불러왔습니다.');
            } else {
                console.warn('저장된 커스텀 레이아웃 좌표가 없거나 비어있습니다. 기본 레이아웃으로 fallback합니다.');
                effectivePattern = layoutMode; 
                if (effectivePattern === 'circle') { 
                    if (totalBookmarks <= 12) effectivePattern = 'circle'; else effectivePattern = 'multiCircle';
                } else if (effectivePattern === 'fullscreen') {
                    effectivePattern = 'fullscreen';
                }
            }
        } catch (error) {
            console.error('커스텀 레이아웃 좌표 로드 중 오류 발생:', error);
            effectivePattern = layoutMode; 
            if (effectivePattern === 'circle') { 
                if (totalBookmarks <= 12) effectivePattern = 'circle'; else effectivePattern = 'multiCircle';
            } else if (effectivePattern === 'fullscreen') {
                effectivePattern = 'fullscreen';
            }
        }
    }
    const viewCenterX = screenWidth / 2;
    const viewCenterY = screenHeight / 2;
    const iconSizeMultiplier = Math.max(1, iconSize / 48);
    // 북마크 간격 계산 개선 - 겹침 방지를 위한 강화된 간격
    let separationMultiplier = 2.0; // 기본 간격 증가
    
    // 아이콘 크기별 간격 조정 - 작은 아이콘일수록 더 많은 여백 비율 적용
    if (iconSize <= 24) {
        separationMultiplier = 3.0; // 매우 작은 아이콘: 300% 간격
    } else if (iconSize <= 32) {
        separationMultiplier = 2.8; // 작은 아이콘: 280% 간격
    } else if (iconSize <= 48) {
        separationMultiplier = 2.5; // 중간 아이콘: 250% 간격
    } else if (iconSize <= 64) {
        separationMultiplier = 2.3; // 큰 아이콘: 230% 간격
    } else {
        separationMultiplier = 2.0; // 매우 큰 아이콘: 200% 간격
    }
    
    // 제목 표시 시 추가 간격 필요
    if (currentSettings.showBookmarkTitles) {
        separationMultiplier += 0.8; // 제목을 위한 추가 공간
    }
    
    // 레이아웃별 추가 조정
    if (currentSettings.bookmarkLayoutMode === 'circle') {
        separationMultiplier += 0.4; // 원형에서는 더 많은 간격 필요
    } else if (currentSettings.bookmarkLayoutMode === 'grid') {
        separationMultiplier += 0.2; // 격자형에서도 약간 더 많은 간격
    }
    
    console.log(`[Spacing Calculation] 아이콘 크기: ${iconSize}px, 최종 간격 배수: ${separationMultiplier.toFixed(1)}x, 레이아웃: ${currentSettings.bookmarkLayoutMode}`);
    
    // 북마크 간격 및 충돌 감지 설정 개선
    config.collisionRadius = iconSize * 1.0; // 충돌 반경 증가
    config.minSeparationDistance = iconSize * separationMultiplier * iconSizeMultiplier;
    config.repulsionForce = (currentSettings.bookmarkLayoutMode === 'grid') ? (0.03 * iconSizeMultiplier) : 
                            (currentSettings.bookmarkLayoutMode === 'fullscreen') ? (0.04 * iconSizeMultiplier) : 
                            (0.025 * iconSizeMultiplier); // 반발력 증가
    const placementPadding = 0.05;
    // 배치 영역 계산 (전체 화면 기준으로 확장)
    const placementOffsetX = 0;
    const placementOffsetY = 0;
    const placementWidth = screenWidth;
    const placementHeight = screenHeight;
    for (let i = 0; i < totalBookmarks; i++) {
        let initialX, initialY;
        const bookmark = bookmarks[i];
        let currentPatternToUse = effectivePattern; 
        if (effectivePattern === 'custom' && customLayoutCoordinates) {
            const savedItem = customLayoutCoordinates.find(item => item.id === (i + 1)); 
            if (savedItem) {
                // Check if new ratio format exists, otherwise fall back to old format
                let ratioX, ratioY;
                if (savedItem.xRatio !== undefined && savedItem.yRatio !== undefined) {
                    // New format: use stored ratios directly
                    ratioX = savedItem.xRatio;
                    ratioY = savedItem.yRatio;
                } else {
                    // Old format: calculate ratios from pixel coordinates
                    const EDITOR_WIDTH = 1280; 
                    const EDITOR_HEIGHT = 720;  
                    ratioX = savedItem.x / EDITOR_WIDTH;
                    ratioY = savedItem.y / EDITOR_HEIGHT;
                }
                initialX = placementOffsetX + ratioX * placementWidth;
                initialY = placementOffsetY + ratioY * placementHeight;
                const itemRadius = iconSize / 2;
                initialX = Math.max(placementOffsetX, Math.min(initialX, placementOffsetX + placementWidth - itemRadius * 0.5));
                initialY = Math.max(placementOffsetY, Math.min(initialY, placementOffsetY + placementHeight - itemRadius * 0.5));
                                } else {
                currentPatternToUse = layoutMode; 
                if (currentPatternToUse === 'circle') { if (totalBookmarks <= 12) currentPatternToUse = 'circle'; else currentPatternToUse = 'multiCircle'; }
                else if (currentPatternToUse === 'fullscreen') { currentPatternToUse = 'fullscreen';}
                console.warn(`커스텀 레이아웃 데이터에 북마크 ID ${i + 1} 없음. Fallback 패턴: ${currentPatternToUse}`);
                initialX = undefined; 
            }
        } else if (effectivePattern !== 'custom') {
             currentPatternToUse = effectivePattern;
             initialX = undefined; 
                            } else {
            currentPatternToUse = layoutMode; 
            if (currentPatternToUse === 'circle') { if (totalBookmarks <= 12) currentPatternToUse = 'circle'; else currentPatternToUse = 'multiCircle'; }
            else if (currentPatternToUse === 'fullscreen') { currentPatternToUse = 'fullscreen';}
            console.warn('커스텀 레이아웃 데이터 로드 실패 또는 데이터 없음. Fallback 패턴: ' + currentPatternToUse);
            initialX = undefined;
        }
        if (initialX === undefined) { 
            if (currentPatternToUse === 'grid') {
                // 격자형 레이아웃 - 보기 좋은 리스트형 간격
                console.log(`[Grid Layout] 개선된 격자 레이아웃 시작 - 총 ${totalBookmarks}개`);
                
                // 적당한 여백으로 설정
                const gridMargin = 30;
                const usableWidth = placementWidth - (gridMargin * 2);
                const usableHeight = placementHeight - (gridMargin * 2);
                
                // 격자형 아이콘 크기: 전체화면보다 작게 설정하여 차별화
                let gridIconSize = Math.min(adjustedIconSize * 0.8, adjustedIconSize - 8); // 기본적으로 20% 또는 8px 축소
                gridIconSize = Math.max(24, gridIconSize); // 최소 24px 보장
                
                // 북마크 수가 많을 때 더 작게 조정
                if (totalBookmarks > 30) {
                    const densityFactor = Math.min(1.0, 30 / totalBookmarks);
                    gridIconSize = Math.max(20, gridIconSize * densityFactor);
                }
                
                console.log(`[Grid Layout] 격자형 아이콘 크기: ${adjustedIconSize}px -> ${gridIconSize}px (전체화면 대비 축소)`);
                
                // 격자형 레이아웃: 리스트 형태의 조밀한 격자 (전체화면과 차별화)
                // 격자형은 더 많은 열과 작은 아이콘으로 리스트에 가깝게 구성
                let cols;
                
                if (totalBookmarks <= 20) {
                    cols = Math.min(6, Math.max(4, Math.ceil(totalBookmarks / 4))); // 4-6열
                } else if (totalBookmarks <= 50) {
                    cols = Math.min(8, Math.max(6, Math.ceil(totalBookmarks / 7))); // 6-8열  
                } else if (totalBookmarks <= 100) {
                    cols = Math.min(10, Math.max(8, Math.ceil(totalBookmarks / 10))); // 8-10열
                } else {
                    cols = Math.min(12, Math.max(10, Math.ceil(totalBookmarks / 12))); // 10-12열
                }
                
                let rows = Math.ceil(totalBookmarks / cols);
                console.log(`[Grid Layout] 격자형 레이아웃: ${cols}열 x ${rows}행 (조밀한 리스트 형태)`);
                
                // 격자형 간격 계산: 붙어있지 않도록 충분한 간격 확보
                const titleHeight = currentSettings.showBookmarkTitles ? Math.max(18, Math.min(26, 26 - Math.floor(totalBookmarks / 25))) : 0;
                const paddingBase = Math.max(12, Math.min(20, 20 - Math.floor(totalBookmarks / 20))); // 충분한 패딩
                
                const itemWidth = gridIconSize + paddingBase;
                const itemHeight = gridIconSize + titleHeight + paddingBase;
                
                // 북마크끼리 붙지 않도록 충분한 간격 설정
                const baseSpacingX = Math.max(itemWidth * 1.25, usableWidth / cols); // 1.25배 이상 간격
                const baseSpacingY = Math.max(itemHeight * 1.3, usableHeight / rows); // 제목 표시를 위해 1.3배 간격
                
                // 최소 간격도 넉넉하게 설정 (붙어있지 않도록)
                const minSpacingX = itemWidth * 1.2; // 최소 20% 여백
                const minSpacingY = itemHeight * 1.25; // 제목 표시를 위해 25% 여백
                
                let spacingX = Math.max(minSpacingX, baseSpacingX);
                let spacingY = Math.max(minSpacingY, baseSpacingY);
                
                // 너무 벌어지지 않도록 최대 간격 제한
                const maxSpacingX = itemWidth * 1.8; // 최대 1.8배
                const maxSpacingY = itemHeight * 1.6; // 최대 1.6배
                
                spacingX = Math.min(spacingX, maxSpacingX);
                spacingY = Math.min(spacingY, maxSpacingY);
                
                console.log(`[Grid Layout] 격자형 간격: 아이템 ${itemWidth}x${itemHeight}, 최종 간격 ${spacingX.toFixed(1)}x${spacingY.toFixed(1)} (붙어있지 않도록 조정)`);
                
                // 격자형 자동 크기 조절: 모든 북마크가 화면에 들어가도록 강제 조절
                let finalSpacingX = spacingX;
                let finalSpacingY = spacingY;
                let finalGridIconSize = gridIconSize;
                
                // 화면 크기에 맞는지 즉시 확인하고 조정
                const requiredWidth = cols * finalSpacingX + (gridMargin * 2);
                const requiredHeight = rows * finalSpacingY + (gridMargin * 2);
                
                console.log(`[Grid Layout] 화면 적합성 체크: 필요(${requiredWidth.toFixed(0)}x${requiredHeight.toFixed(0)}) vs 사용가능(${placementWidth}x${placementHeight})`);
                
                if (requiredWidth > placementWidth || requiredHeight > placementHeight) {
                    // 격자형 크기 조정: 제목과 북마크가 겹치지 않도록 충분한 간격 유지
                    const scaleFactorX = placementWidth / requiredWidth;
                    const scaleFactorY = placementHeight / requiredHeight;
                    const scaleFactor = Math.min(scaleFactorX, scaleFactorY) * 0.9; // 여유를 위해 90%만 사용
                    
                    console.log(`[Grid Layout] 격자형 크기 조정: 스케일 팩터 ${scaleFactor.toFixed(3)}`);
                    
                    // 격자형 아이콘 크기 조정 (최소 크기 보장)
                    finalGridIconSize = Math.max(20, gridIconSize * scaleFactor);
                    
                    // 격자형 간격 재계산 (제목 표시 공간 확보)
                    const adjustedTitleHeight = Math.max(16, titleHeight * scaleFactor); // 제목 높이 최소 보장
                    const adjustedPadding = Math.max(10, paddingBase * scaleFactor); // 패딩 최소 보장
                    const adjustedItemWidth = finalGridIconSize + adjustedPadding;
                    const adjustedItemHeight = finalGridIconSize + adjustedTitleHeight + adjustedPadding;
                    
                    finalSpacingX = Math.max(adjustedItemWidth * 1.2, adjustedItemWidth + 8); // 최소 8px 간격
                    finalSpacingY = Math.max(adjustedItemHeight * 1.25, adjustedItemHeight + 10); // 제목을 위해 최소 10px 간격
                    
                    console.log(`[Grid Layout] 격자형 조정 완료: 아이콘 ${finalGridIconSize.toFixed(1)}px, 간격 ${finalSpacingX.toFixed(1)}x${finalSpacingY.toFixed(1)} (제목 표시 공간 확보)`);
                } else {
                    console.log(`[Grid Layout] 격자형 크기 조정 불필요 - 화면에 적합`);
                }
                
                // 최종 값 적용
                gridIconSize = finalGridIconSize;
                spacingX = finalSpacingX;
                spacingY = finalSpacingY;
                
                console.log(`[Grid Layout] 최종 배치: ${cols}열 x ${rows}행, 아이콘: ${gridIconSize.toFixed(1)}px, 간격: ${spacingX.toFixed(1)}x${spacingY.toFixed(1)}`);
                
                // 현재 아이템의 위치 계산
                const col = i % cols;
                const row = Math.floor(i / cols);
                
                // 격자 전체 크기와 화면 중앙 정렬
                const totalGridWidth = cols * spacingX;
                const totalGridHeight = rows * spacingY;
                const offsetX = Math.max(0, (usableWidth - totalGridWidth) / 2);
                const offsetY = Math.max(0, (usableHeight - totalGridHeight) / 2);
                
                // 최종 위치 계산 - 여백과 중앙 정렬 고려
                initialX = gridMargin + offsetX + (col * spacingX) + (spacingX / 2);
                initialY = gridMargin + offsetY + (row * spacingY) + (spacingY / 2);
                
                // 화면 경계 안전 체크 (추가 보호)
                const iconRadius = gridIconSize / 2;
                const minX = iconRadius + 10; // 최소 여백
                const maxX = placementWidth - iconRadius - 10;
                const minY = iconRadius + 10;
                const maxY = placementHeight - iconRadius - 10;
                
                initialX = Math.max(minX, Math.min(initialX, maxX));
                initialY = Math.max(minY, Math.min(initialY, maxY));
                
                // 조정된 아이콘 크기 적용 (격자형 레이아웃에서는 항상 적용)
                iconSize = gridIconSize;
                
                console.log(`[Grid Layout] 북마크 ${i}: (${col},${row}) -> (${initialX.toFixed(0)}, ${initialY.toFixed(0)}), 크기: ${iconSize}px`);
            } else if (currentPatternToUse === 'fullscreen') {
                // 전체화면 레이아웃 - 화면 전체를 최대한 활용
                // 여백을 최소화하여 전체 화면 활용도 극대화
                const minMargin = Math.max(iconSize * 0.2, 5); // 여백을 더 줄임
                const availableWidth = placementWidth - (minMargin * 2);
                const availableHeight = placementHeight - (minMargin * 2);
                
                console.log(`[Fullscreen Layout] 화면 크기: ${placementWidth}x${placementHeight}, 사용 가능 영역: ${availableWidth}x${availableHeight}, 여백: ${minMargin}px`);
                
                // 최적의 행과 열 계산 - 화면 비율에 맞춰 더 균등하게 분배
                const aspectRatio = availableWidth / availableHeight;
                let optimalCols = Math.max(1, Math.round(Math.sqrt(totalBookmarks * aspectRatio)));
                let optimalRows = Math.max(1, Math.ceil(totalBookmarks / optimalCols));
                
                // 모든 북마크가 배치될 수 있도록 조정
                while (optimalRows * optimalCols < totalBookmarks) {
                    if (aspectRatio > 1) { // 가로가 더 긴 경우 열 추가 우선
                        optimalCols++;
                        optimalRows = Math.ceil(totalBookmarks / optimalCols);
                    } else { // 세로가 더 긴 경우 행 추가 우선
                        optimalRows++;
                        optimalCols = Math.ceil(totalBookmarks / optimalRows);
                    }
                }
                
                // 화면을 최대한 활용하도록 셀 크기 계산
                const cellWidth = availableWidth / Math.max(optimalCols, 1);
                const cellHeight = availableHeight / Math.max(optimalRows, 1);
                
                console.log(`[Fullscreen Layout] 개선된 그리드: ${optimalCols}x${optimalRows}, 셀 크기: ${cellWidth.toFixed(1)}x${cellHeight.toFixed(1)}`);
                
                // 현재 북마크의 행과 열 위치
                const col = i % optimalCols;
                const row = Math.floor(i / optimalCols);
                
                // 위치 계산 - 각 셀의 중앙에 배치하여 전체 화면 활용
                initialX = minMargin + (col * cellWidth) + (cellWidth / 2);
                initialY = minMargin + (row * cellHeight) + (cellHeight / 2);
                
                console.log(`[Fullscreen Layout] 북마크 ${i}: 위치(${col},${row}) -> (${initialX.toFixed(1)}, ${initialY.toFixed(1)})`);
            } else if (currentPatternToUse === 'honeycomb') {
                const numItems = totalBookmarks;
                const R_honey = Math.min(placementWidth / (2 * Math.ceil(Math.sqrt(numItems * 2 * Math.sqrt(3) / 3))), placementHeight / (1.5 * Math.ceil(Math.sqrt(numItems * 2 * Math.sqrt(3) / 3)) + 0.5)) / 2.2;
                const hexSize = Math.max(iconSize * 0.7, R_honey);
                const hexWidth = Math.sqrt(3) * hexSize;
                const hexHeight = 2 * hexSize;
                let colsEst = Math.floor(placementWidth / hexWidth); if(colsEst === 0) colsEst = 1;
                let r_honey = Math.floor(i / colsEst);
                let c_honey = i % colsEst;
                let tempX = placementOffsetX + c_honey * hexWidth + (r_honey % 2 === 1 ? hexWidth / 2 : 0);
                let tempY = placementOffsetY + r_honey * (hexHeight * 0.75);
                const gridContentWidth = colsEst * hexWidth + ( (Math.ceil(numItems/colsEst) -1) % 2 === 1 ? hexWidth / 2 : 0) ;
                const gridContentHeight = Math.ceil(numItems / colsEst) * (hexHeight * 0.75) + (hexHeight * 0.25); 
                const totalOffsetX = (placementWidth - gridContentWidth) / 2;
                const totalOffsetY = (placementHeight - gridContentHeight) / 2;
                initialX = tempX + (totalOffsetX > 0 ? totalOffsetX : 0) + hexWidth/2;
                initialY = tempY + (totalOffsetY > 0 ? totalOffsetY : 0) + hexHeight/2;
            } else if (currentPatternToUse === 'multiCircle' || currentPatternToUse === 'circle') {
                // 자연스러운 원형 레이아웃 - 강제 대칭 없이 자연스러운 분포
                const titleSpace = currentSettings.showBookmarkTitles ? 15 : 0;
                const screenMargin = adjustedIconSize / 2 + titleSpace + 20;
                const maxRadius = Math.min(placementWidth - screenMargin * 2, placementHeight - screenMargin * 2) / 2 * 0.88;
                
                console.log(`[Natural Circle] 화면 크기: ${placementWidth}x${placementHeight}, 최대 반지름: ${maxRadius.toFixed(1)}px`);
                
                // 아이콘 크기별 간격 조정 - 가독성과 미관 개선
                let itemSpacingMultiplier = 1.0;
                if (adjustedIconSize <= 32) {
                    itemSpacingMultiplier = 3.0; // 작은 아이콘: 간격 대폭 증가로 가독성 향상
                } else if (adjustedIconSize <= 48) {
                    itemSpacingMultiplier = 2.0; // 중간 크기: 간격 증가로 깔끔한 배치
                } else {
                    itemSpacingMultiplier = 1.6; // 큰 아이콘: 적절한 간격 유지
                }
                
                if (currentSettings.showBookmarkTitles) {
                    itemSpacingMultiplier += 0.5; // 제목 표시 시 간격 더 증가
                }
                
                const itemSpacing = adjustedIconSize * itemSpacingMultiplier;
                
                // 원간 간격 조정 - 층간 분리 개선
                let radiusStepMultiplier = 1.0;
                if (adjustedIconSize <= 32) {
                    radiusStepMultiplier = 2.5; // 작은 아이콘: 원간 간격 대폭 증가
                } else if (adjustedIconSize <= 48) {
                    radiusStepMultiplier = 1.8; // 중간 크기: 원간 간격 증가
                } else {
                    radiusStepMultiplier = 1.5; // 큰 아이콘: 적절한 원간 간격
                }
                
                const radiusStep = adjustedIconSize * radiusStepMultiplier;
                
                console.log(`[Natural Circle] 아이콘 크기: ${adjustedIconSize}px, 아이템 간격: ${itemSpacing.toFixed(1)}px, 원간 간격: ${radiusStep.toFixed(1)}px`);
                
                // 자연스러운 원들 생성 (강제 대칭 없음)
                const circles = [];
                let currentRadius = radiusStep;
                let totalCapacity = 0;
                
                while (currentRadius <= maxRadius) {
                    const circumference = 2 * Math.PI * currentRadius;
                    let itemsInThisCircle = Math.max(6, Math.floor(circumference / itemSpacing));
                    
                    // 자연스러운 분포를 위한 최소 조정만 (극단적 대칭 강제 안함)
                    if (itemsInThisCircle >= 12) {
                        // 큰 원에서만 미세 조정 (2의 배수로 간단히)
                        if (itemsInThisCircle % 2 === 1) {
                            itemsInThisCircle -= 1;
                        }
                    }
                    
                    circles.push({
                        radius: currentRadius,
                        capacity: itemsInThisCircle,
                        startIndex: totalCapacity
                    });
                    
                    totalCapacity += itemsInThisCircle;
                    currentRadius += radiusStep;
                }
                
                console.log(`[Natural Circle] 총 ${totalBookmarks}개 요청, ${circles.length}개 원 가능, 최대수용: ${totalCapacity}개`);
                
                // 북마크 배치 결정
                let bookmarksToDisplay = Math.min(totalBookmarks, totalCapacity);
                
                // 현재 북마크의 위치 계산
                if (i >= bookmarksToDisplay) {
                    console.log(`[Natural Circle] 북마크 ${i}: 화면 한계로 숨김 (${bookmarksToDisplay}개만 표시)`);
                    initialX = -1000;
                    initialY = -1000;
                } else {
                    // 어느 원에 속하는지 찾기
                    let targetCircle = null;
                    let positionInCircle = 0;
                    let accumulatedItems = 0;
                    
                    for (const circle of circles) {
                        if (i >= accumulatedItems && i < accumulatedItems + circle.capacity) {
                            targetCircle = circle;
                            positionInCircle = i - accumulatedItems;
                            break;
                        }
                        accumulatedItems += circle.capacity;
                    }
                    
                    if (targetCircle) {
                        const angleStep = (2 * Math.PI) / targetCircle.capacity;
                        const angle = positionInCircle * angleStep - (Math.PI / 2); // 12시 방향부터 시작
                        
                        initialX = viewCenterX + Math.cos(angle) * targetCircle.radius;
                        initialY = viewCenterY + Math.sin(angle) * targetCircle.radius;
                        
                        console.log(`[Natural Circle] 북마크 ${i}: 반지름 ${targetCircle.radius.toFixed(1)}px, 위치 ${positionInCircle}/${targetCircle.capacity}, 각도 ${(angle * 180 / Math.PI).toFixed(1)}°`);
                    } else {
                        // 예외 상황
                        initialX = viewCenterX;
                        initialY = viewCenterY;
                    }
                }
                
                // 화면 경계 체크 및 조정 (숨겨진 북마크는 제외) - 북마크 개수 우선으로 최소 여백
                if (!(initialX === -1000 && initialY === -1000)) {
                    // 최소한의 안전 여백으로 더 많은 북마크 표시 가능
                    const titleSpace = currentSettings.showBookmarkTitles ? 12 : 0;
                    const safeMargin = adjustedIconSize / 2 + titleSpace + 15; // 최소한의 안전 여백
                    
                    initialX = Math.max(safeMargin, Math.min(initialX || viewCenterX, placementWidth - safeMargin));
                    initialY = Math.max(safeMargin, Math.min(initialY || viewCenterY, placementHeight - safeMargin));
                    
                    // 로그 제거로 성능 향상
                    // console.log(`[Boundary Check] 북마크 ${i}: 안전여백 ${safeMargin}px 적용, 위치 (${initialX.toFixed(1)}, ${initialY.toFixed(1)})`);
                }
            } else if (currentPatternToUse === 'spiral') {
                const turns = Math.max(2, Math.min(5, Math.ceil(totalBookmarks / 20)));
                const angle_spiral = (i / totalBookmarks) * Math.PI * 2 * turns;
                const radiusAdjustment_spiral = Math.max(1, iconSizeMultiplier * 1.1);
                const maxRadius_spiral = Math.min(placementWidth, placementHeight) / 2 * 0.9 * radiusAdjustment_spiral;
                const spiralRadius = (i / totalBookmarks) * maxRadius_spiral;
                initialX = viewCenterX + Math.cos(angle_spiral) * spiralRadius;
                initialY = viewCenterY + Math.sin(angle_spiral) * spiralRadius;
            } else {
                const angle_default = (i / totalBookmarks) * Math.PI * 2 - (Math.PI/2);
                const radius_default = Math.min(placementWidth, placementHeight) / 3 * (0.5 + (i / totalBookmarks) * 0.5);
                initialX = viewCenterX + Math.cos(angle_default) * radius_default;
                initialY = viewCenterY + Math.sin(angle_default) * radius_default;
            }
            
            // 모든 레이아웃 패턴에서 크기 조정 적용
            if (adjustedIconSize !== iconSize) {
                iconSize = adjustedIconSize; // 후속 계산을 위해 업데이트
            }
        }
        // 숨겨진 북마크 처리 - 완전히 화면 밖으로 이동
        let finalX = initialX;
        let finalY = initialY;
        let isHidden = false;
        
        if (initialX === -1000 && initialY === -1000) {
            // 완전한 원형 대칭을 위해 숨겨진 북마크
            finalX = -10000; // 화면 훨씬 밖으로
            finalY = -10000;
            isHidden = true;
            console.log(`[Hidden Bookmark] 북마크 ${i} (${bookmark.title?.substring(0,15) || 'Unknown'}): 완전한 원형 대칭을 위해 숨김`);
        } else if (!finalX || !finalY) {
            // 위치가 설정되지 않은 경우에만 기본값 사용
            finalX = finalX || viewCenterX;
            finalY = finalY || viewCenterY;
        }
        
        const physicsObj = {
            bookmark: bookmark,
            x: finalX, 
            y: finalY,
            vx: 0, vy: 0, ax: 0, ay: 0,
            mass: config.mass,
            radius: config.collisionRadius,
            index: i,
            inCollision: false,
            isHidden: isHidden // 숨겨진 상태 추가
        };
        
        // 디버깅을 위한 위치 로그 (디버그 모드에서만)
        if (DEBUG_MODE) {
            console.log(`[createPhysicsBookmarks] 북마크 ${i} (${bookmark.title?.substring(0,15) || 'Unknown'}): 초기 위치 (${initialX?.toFixed(1) || 'undefined'}, ${initialY?.toFixed(1) || 'undefined'})`);
        }
        physicsObjects.push(physicsObj);
    }
    
    // adjustedIconSize도 함께 반환
    return { physicsObjects, adjustedIconSize };
}

function runPhysicsSimulation(physicsObjects, centerX, centerY, screenWidth, screenHeight, config) {
    const steps = config.simulationSteps || 15;
    const startTime = performance.now();
    const iconSizeEffective = parseInt(currentSettings.bookmarkIconSize || '48', 10);
    const iconSizeMultiplier = Math.max(1, iconSizeEffective / 48);
    config.repulsionForceCurrent = (config.repulsionForce || 0.015) * iconSizeMultiplier; 
    config.minSeparationDistanceCurrent = (config.minSeparationDistance || (iconSizeEffective * 1.8)) * iconSizeMultiplier;
    for (let step = 0; step < steps; step++) {
        for (let i = 0; i < physicsObjects.length; i++) {
            const obj1 = physicsObjects[i];
            const dx_center = centerX - obj1.x;
            const dy_center = centerY - obj1.y;
            const distToCenter = Math.sqrt(dx_center * dx_center + dy_center * dy_center);
            if (distToCenter > 0) {
                const centerForceFactor = Math.min(1.0, distToCenter / (Math.min(screenWidth, screenHeight) * 0.3));
                const centerForceMultiplier = config.centerForceMultiplier || 1.0;
                obj1.ax += (dx_center / distToCenter) * config.centerAttraction * centerForceFactor * centerForceMultiplier;
                obj1.ay += (dy_center / distToCenter) * config.centerAttraction * centerForceFactor * centerForceMultiplier;
            }
            const margin = obj1.radius * 0.1; 
            if (obj1.x < margin) obj1.ax += (margin - obj1.x) * 0.05;
            else if (obj1.x > screenWidth - margin) obj1.ax -= (obj1.x - (screenWidth - margin)) * 0.05;
            if (obj1.y < margin) obj1.ay += (margin - obj1.y) * 0.05;
            else if (obj1.y > screenHeight - margin) obj1.ay -= (obj1.y - (screenHeight - margin)) * 0.05;
            for (let j = i + 1; j < physicsObjects.length; j++) {
                const obj2 = physicsObjects[j];
                const dx = obj2.x - obj1.x;
                const dy = obj2.y - obj1.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1; 
                const minDistance = config.minSeparationDistanceCurrent;
                if (distance < minDistance) {
                    obj1.inCollision = true; obj2.inCollision = true;
                    const overlap = minDistance - distance;
                    const repulsion = config.repulsionForceCurrent * overlap;
                    const nx = dx / distance; const ny = dy / distance;
                    obj1.ax -= nx * repulsion / obj1.mass;
                    obj1.ay -= ny * repulsion / obj1.mass;
                    obj2.ax += nx * repulsion / obj2.mass;
                    obj2.ay += ny * repulsion / obj2.mass;
                    const adjustFactor = 0.35 * iconSizeMultiplier;
                    obj1.x -= nx * adjustFactor * overlap / 2;
                    obj1.y -= ny * adjustFactor * overlap / 2;
                    obj2.x += nx * adjustFactor * overlap / 2;
                    obj2.y += ny * adjustFactor * overlap / 2;
                } else if (distance < minDistance * 1.5) {
                    const repulsionFactor = 0.005 * config.repulsionForceCurrent;
                    const nx = dx / distance; const ny = dy / distance;
                    obj1.ax -= nx * repulsionFactor / obj1.mass;
                    obj1.ay -= ny * repulsionFactor / obj1.mass;
                    obj2.ax += nx * repulsionFactor / obj2.mass;
                    obj2.ay += ny * repulsionFactor / obj2.mass;
                }
            }
        }
        for (const obj of physicsObjects) {
            obj.vx += obj.ax; obj.vy += obj.ay;
            const dampFactor = Math.max(0.7, 0.92 - iconSizeMultiplier * 0.08); 
            obj.vx *= dampFactor; obj.vy *= dampFactor;
            const speedLimit = config.maxSpeed * (1 / Math.max(1, iconSizeMultiplier * 0.8));
            const speed = Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy);
            if (speed > speedLimit) {
                obj.vx = (obj.vx / speed) * speedLimit;
                obj.vy = (obj.vy / speed) * speedLimit;
            }
            obj.x += obj.vx; obj.y += obj.vy;
            const objMargin = obj.radius; 
            if (obj.x < objMargin) { obj.x = objMargin; obj.vx *= -0.7; }
            else if (obj.x > screenWidth - objMargin) { obj.x = screenWidth - objMargin; obj.vx *= -0.7; }
            if (obj.y < objMargin) { obj.y = objMargin; obj.vy *= -0.7; }
            else if (obj.y > screenHeight - objMargin) { obj.y = screenHeight - objMargin; obj.vy *= -0.7; }
            obj.ax = 0; obj.ay = 0; obj.inCollision = false;
        }
    }
}

function rebalanceToCenter(physicsObjects, centerX, centerY) {
    if (!physicsObjects || physicsObjects.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    physicsObjects.forEach(obj => { minX = Math.min(minX, obj.x); minY = Math.min(minY, obj.y); maxX = Math.max(maxX, obj.x); maxY = Math.max(maxY, obj.y); });
    const groupCenterX = (minX + maxX) / 2; const groupCenterY = (minY + maxY) / 2;
    const groupWidth = maxX - minX; const groupHeight = maxY - minY;
    const offsetX = centerX - groupCenterX; const offsetY = centerY - groupCenterY;
    const screenWidth = window.innerWidth; const screenHeight = window.innerHeight;
    const iconSizeCurrent = parseInt(currentSettings.bookmarkIconSize || '48', 10);
    const safetyMargin = iconSizeCurrent * 1.1;
    const minGroupSize = Math.min(screenWidth, screenHeight) * 0.4;
    let scaleX = 1, scaleY = 1;
    if (groupWidth > 0 && groupWidth < minGroupSize) scaleX = minGroupSize / groupWidth;
    if (groupHeight > 0 && groupHeight < minGroupSize) scaleY = minGroupSize / groupHeight;
    const maxGroupSize = Math.min(screenWidth, screenHeight) * 0.85;
    if (groupWidth > maxGroupSize) scaleX = Math.min(scaleX, maxGroupSize / groupWidth);
    if (groupHeight > maxGroupSize) scaleY = Math.min(scaleY, maxGroupSize / groupHeight);
    const scale = Math.min(scaleX, scaleY, 1.5); 
    physicsObjects.forEach(obj => {
        const relX = obj.x - groupCenterX; const relY = obj.y - groupCenterY;
        obj.x = centerX + relX * scale;
        obj.y = centerY + relY * scale;
    });
    let minNewX = Infinity, minNewY = Infinity, maxNewX = -Infinity, maxNewY = -Infinity;
    physicsObjects.forEach(obj => { minNewX = Math.min(minNewX, obj.x); minNewY = Math.min(minNewY, obj.y); maxNewX = Math.max(maxNewX, obj.x); maxNewY = Math.max(maxNewY, obj.y);});
    let finalOffsetX = 0, finalOffsetY = 0;
    if (minNewX < safetyMargin) finalOffsetX = safetyMargin - minNewX;
    else if (maxNewX > screenWidth - safetyMargin) finalOffsetX = screenWidth - safetyMargin - maxNewX;
    if (minNewY < safetyMargin) finalOffsetY = safetyMargin - minNewY;
    else if (maxNewY > screenHeight - safetyMargin) finalOffsetY = screenHeight - safetyMargin - maxNewY;
    if (finalOffsetX !== 0 || finalOffsetY !== 0) {
        physicsObjects.forEach(obj => { obj.x += finalOffsetX; obj.y += finalOffsetY; });
    }
}

function placeBookmarksWithPhysics(physicsObjects, mouseX, mouseY, iconSize) {
    console.log("[placeBookmarksWithPhysics] 시작", { physicsObjects: physicsObjects?.length, mouseX, mouseY, iconSize });
    const screenWidth = window.innerWidth; const screenHeight = window.innerHeight;
    const safetyMargin = iconSize * 0.75; 
    const minX = safetyMargin; const maxX = screenWidth - safetyMargin;
    const minY = safetyMargin; const maxY = screenHeight - safetyMargin;
    const viewCenterX = screenWidth / 2; const viewCenterY = screenHeight / 2;
    
    // 북마크 컨테이너 확인 및 사용
    const bookmarkContainer = document.getElementById(BOOKMARK_BAR_ID);
    if (!bookmarkContainer) {
        console.error("[placeBookmarksWithPhysics] 북마크 컨테이너를 찾을 수 없습니다.");
        return;
    }
    
    // 확인을 위해 컨테이너 상태 로깅
    console.log("[placeBookmarksWithPhysics] 컨테이너 상태:", 
                "classes:", bookmarkContainer.className,
                "data-visible:", bookmarkContainer.getAttribute('data-visible'));
    
    // 격자형과 전체화면 레이아웃에서는 원래 순서 유지, 그 외에서는 거리순 정렬
    if (currentSettings.bookmarkLayoutMode !== 'fullscreen' && currentSettings.bookmarkLayoutMode !== 'grid') {
        physicsObjects.forEach(obj => {
            const dx = obj.x - viewCenterX; const dy = obj.y - viewCenterY;
            obj.distanceFromCenter = Math.sqrt(dx*dx + dy*dy);
        });
        physicsObjects.sort((a, b) => b.distanceFromCenter - a.distanceFromCenter);
        console.log("[placeBookmarksWithPhysics] 원형 레이아웃: 거리순 정렬 적용");
    } else {
        console.log("[placeBookmarksWithPhysics] 격자형/전체화면 레이아웃: 원래 순서 유지");
    }
    console.log("[placeBookmarksWithPhysics] 정렬된 물리 객체:", physicsObjects.length);
    
    for (let i = 0; i < physicsObjects.length; i++) {
        const obj = physicsObjects[i];
        const bookmark = obj.bookmark;
        
        // 숨겨진 북마크는 DOM에 추가하지 않음
        if (obj.isHidden) {
            console.log(`[placeBookmarksWithPhysics] 북마크 ${i} (${bookmark.title?.substring(0,10) || 'Unknown'}...) 완전한 원형 대칭을 위해 숨김 처리`);
            continue;
        }
        
        let finalX = obj.x; let finalY = obj.y;
        finalX = Math.max(minX, Math.min(finalX, maxX));
        finalY = Math.max(minY, Math.min(finalY, maxY));
        console.log(`[placeBookmarksWithPhysics] 북마크 ${i} (${bookmark.title?.substring(0,10) || 'Unknown'}...) 최종 위치: X=${finalX.toFixed(1)}, Y=${finalY.toFixed(1)}`);
        
        const bookmarkIcon = createBookmarkIcon(bookmark, iconSize, obj.index);
        if (!bookmarkIcon) {
            console.error(`[placeBookmarksWithPhysics] 북마크 아이콘 ${i} 생성 실패`);
            continue;
        }
        
        setBookmarkAnimation(bookmarkIcon, mouseX, mouseY, finalX, finalY, obj.index);
        
        // 컨테이너에 아이콘 추가
        bookmarkContainer.appendChild(bookmarkIcon);
        console.log(`[placeBookmarksWithPhysics] 북마크 아이콘 ${obj.index} 컨테이너에 추가됨.`);
    }
    
    console.log("[placeBookmarksWithPhysics] 완료");
}

function createBookmarkIcon(bookmark, iconSize, index) {
    try {
        if (!bookmark || !bookmark.url) {
            console.error("[createBookmarkIcon] 잘못된 북마크 데이터:", bookmark);
            return null;
        }
        
        console.log(`[createBookmarkIcon] 시작: 북마크 '${bookmark.title?.substring(0,20) || "제목 없음"}...', 아이콘 크기: ${iconSize}, 인덱스: ${index}`);
        
        const bookmarkDiv = document.createElement('div');
        bookmarkDiv.className = 'bookstaxx-bookmark-icon';
        bookmarkDiv.setAttribute('data-bookstaxx-element', 'true');
        bookmarkDiv.setAttribute('data-bookmark-id', bookmark.id || '');
        bookmarkDiv.setAttribute('data-url', bookmark.url);
        bookmarkDiv.setAttribute('title', bookmark.title || bookmark.url); // 접근성 개선: 툴팁 추가
        bookmarkDiv.setAttribute('role', 'button'); // 접근성 개선: 역할 정의
        bookmarkDiv.setAttribute('aria-label', `북마크: ${bookmark.title || bookmark.url}`); // 접근성 개선
        
        if (index !== undefined) {
            bookmarkDiv.setAttribute('data-index', index.toString());
            // 모든 북마크 아이콘을 동일한 기본 Z-INDEX로 설정
            // 개별 요소의 Z-INDEX는 CSS에서 처리
            bookmarkDiv.style.zIndex = '2147483642';
        }
        
        // 아이콘 이미지 컨테이너 추가
        const iconContainer = document.createElement('div');
        iconContainer.className = 'bookstaxx-bookmark-icon-img';
        
        const favIcon = document.createElement('img');
        favIcon.className = 'bookstaxx-favicon';
        // favicon 캐시 활용
        getCachedFavicon(bookmark.url, 64, (iconUrl) => { favIcon.src = iconUrl; });
        favIcon.alt = '';
        favIcon.setAttribute('loading', 'lazy'); // 성능 개선: 지연 로딩
        favIcon.onerror = function() {
            this.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>';
            this.style.filter = 'invert(0.7)';
        };
        
        iconContainer.appendChild(favIcon);
        bookmarkDiv.appendChild(iconContainer);
        
        // 개선된 폰트 크기 계산 - 사용자 설정 우선 반영
        let actualIconSize = parseInt(iconSize, 10) || 48;
        const defaultIconSize = parseInt(currentSettings.bookmarkIconSize, 10) || 48;
        const userFontSizeSetting = parseInt(currentSettings.bookmarkFontSize, 10) || 12;
        
        // 사용자가 설정한 폰트 크기를 기준으로 시작
        let baseFontSize = userFontSizeSetting;
        
        // 반응형/자동 축소가 발생한 경우에만 비례 축소 적용
        if (actualIconSize < defaultIconSize) {
            const sizeRatio = actualIconSize / defaultIconSize;
            
            // 사용자 설정을 존중하되, 심한 축소 시에만 폰트 크기도 줄임
            if (sizeRatio < 0.7) { // 70% 미만으로 축소된 경우에만 폰트도 축소
                baseFontSize = Math.max(10, Math.round(userFontSizeSetting * Math.max(0.8, sizeRatio)));
                if (DEBUG_MODE) console.log(`[Responsive Font] 심한 축소로 인한 폰트 조절: ${userFontSizeSetting}px -> ${baseFontSize}px (비율: ${sizeRatio.toFixed(2)})`);
            } else {
                // 경미한 축소는 사용자 폰트 크기 유지
                baseFontSize = userFontSizeSetting;
                if (DEBUG_MODE) console.log(`[User Font] 사용자 설정 폰트 크기 유지: ${baseFontSize}px (아이콘 비율: ${sizeRatio.toFixed(2)})`);
            }
        } else {
            // 축소되지 않은 경우 사용자 설정 그대로 사용
            baseFontSize = userFontSizeSetting;
            if (DEBUG_MODE) console.log(`[User Font] 사용자 설정 폰트 크기 적용: ${baseFontSize}px`);
        }
        
        // 최소/최대 폰트 크기 제한
        baseFontSize = Math.max(8, Math.min(24, baseFontSize));
        
        if (currentSettings.showBookmarkTitles) {
            const titleSpan = document.createElement('span');
            titleSpan.className = 'bookstaxx-bookmark-icon-title';
            // Z-INDEX는 CSS에서 통일 관리됨 (제목은 아이콘보다 낮음)
            let titleText = bookmark.title || bookmark.url;
            const titleLengthLimit = parseInt(currentSettings.titleLengthLimit || '6', 10);
            if (titleText.length > titleLengthLimit) {
                titleText = titleText.substring(0, titleLengthLimit) + '...';
            }
            titleSpan.textContent = titleText;
            bookmarkDiv.appendChild(titleSpan);
            titleSpan.style.fontSize = `${baseFontSize}px`;
            // 제목 컨테이너 너비를 아이콘 크기에 맞춰 제한하여 배경 넘침 방지
            bookmarkDiv.style.maxWidth = `${actualIconSize + 20}px`;
        }
        
        // 아이콘 크기 적용: actualIconSize는 이미 위에서 계산됨
        iconContainer.style.width = `${actualIconSize}px`;
        iconContainer.style.height = `${actualIconSize}px`;
        
        console.log(`[createBookmarkIcon] 아이콘 DOM 생성 완료. 최종 크기: ${actualIconSize}px, 폰트 크기: ${baseFontSize}px`);
        
        // 이벤트 리스너 - 클릭
        bookmarkDiv.addEventListener('click', function(event) {
            try {
                event.preventDefault();
                event.stopPropagation();
                console.log("[북마크 클릭됨]", this.getAttribute('data-url'));
                const url = this.getAttribute('data-url');
                if (url) {
                    chrome.runtime.sendMessage({
                        action: "openBookmark",
                        url: url,
                        openInNewTab: currentSettings.openInNewTab, 
                        debug: {
                            from: "content.js createBookmarkIcon",
                            currentSettings_openInNewTab: currentSettings.openInNewTab
                        }
                    }, function(response) {
                        if (chrome.runtime.lastError) {
                            console.error("북마크 열기 중 오류:", chrome.runtime.lastError.message);
                            if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
                                if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in openBookmark callback");
                            }
                            return;
                        }
                        if (response && response.success) {
                            console.log(`북마크가 ${response.openedIn === 'newTab' ? '새 탭에서' : '현재 탭에서'} 열렸습니다.`);
                        } else {
                            console.error("북마크 열기 실패:", response ? response.error : "알 수 없는 오류");
                        }
                    });
                    if (currentSettings.autoCloseAfterSelect) {
                        removeBookmarkBar();
                    }
                }
            } catch (error) {
                console.error("북마크 클릭 이벤트 처리 중 오류:", error);
            }
        });
        
        // 이벤트 리스너 - 호버
        bookmarkDiv.addEventListener('mouseenter', function() {
            this.style.zIndex = '2147483647'; // 호버 시 최상단에 표시
            this.classList.add('bookstaxx-bookmark-hover');
        });
        
        bookmarkDiv.addEventListener('mouseleave', function() {
            // 마우스 떠날 때 기본 Z-INDEX로 복귀
            this.style.zIndex = '2147483642';
            this.classList.remove('bookstaxx-bookmark-hover');
        });
        
        // 접근성 - 키보드 이벤트
        bookmarkDiv.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.click(); // 키보드로 접근할 때도 클릭 이벤트 발생
            }
        });
        
        // 탭 순서 설정
        bookmarkDiv.tabIndex = 0;
        
        // 이벤트 리스너 등 설정 이전에 크기 지정 (제목과 겹치지 않도록)
        const containerPadding = 6; // 충분한 패딩
        const titleSpace = currentSettings.showBookmarkTitles ? baseFontSize + 16 : 0; // 제목 공간 충분히 확보
        bookmarkDiv.style.width = `${actualIconSize + containerPadding}px`;
        bookmarkDiv.style.height = `${actualIconSize + titleSpace}px`;
        
        return bookmarkDiv;
    } catch (error) {
        console.error("[createBookmarkIcon] 북마크 아이콘 생성 중 오류:", error);
        return null;
    }
}

function showLoadingIndicator(container) {
    if (!container) return null;
    
    // 기존 로딩 인디케이터 제거
    const existingLoader = document.getElementById('bookstaxx-loading');
    if (existingLoader) existingLoader.remove();
    
    // 메시지 가져오기
    let loadingText = "북마크 로드 중...";
    try {
        loadingText = chrome.i18n.getMessage("loadingBookmarks") || loadingText;
    } catch (e) {
        console.warn("로딩 메시지 번역 가져오기 실패:", e);
    }
    
    // 로딩 인디케이터 생성
    const loader = document.createElement('div');
    loader.id = 'bookstaxx-loading';
    loader.className = 'bookstaxx-loading-indicator';
    
    const spinnerDiv = document.createElement('div');
    spinnerDiv.className = 'bookstaxx-spinner';
    
    const textDiv = document.createElement('div');
    textDiv.className = 'bookstaxx-loading-text';
    textDiv.textContent = loadingText;
    
    loader.appendChild(spinnerDiv);
    loader.appendChild(textDiv);
    
    // 접근성 향상
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    
    // 컨테이너에 추가
    container.appendChild(loader);
    return loader;
}

function hideLoadingIndicator() {
    const loader = document.getElementById('bookstaxx-loading');
    if (loader) {
        // 페이드 아웃 효과
        loader.style.opacity = '0';
        setTimeout(() => {
            if (loader.parentNode) {
                loader.parentNode.removeChild(loader);
            }
        }, 300);
    }
}

// styles.css에 로딩 인디케이터 스타일 추가
function addLoadingStyles() {
    let styleElement = document.getElementById('bookstaxx-loading-styles');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'bookstaxx-loading-styles';
        if (document.head) document.head.appendChild(styleElement);
        else console.error("addLoadingStyles: document.head not found");
    }
    
    styleElement.textContent = `
        .bookstaxx-loading-indicator {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 2147483645;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            transition: opacity 0.3s ease;
            min-width: 120px;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
        }
        
        @media (prefers-color-scheme: light) {
            .bookstaxx-loading-indicator {
                background-color: rgba(255, 255, 255, 0.85);
                color: #333;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            }
        }
        
        .bookstaxx-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: bookstaxx-spin 1s linear infinite;
            margin-bottom: 10px;
            will-change: transform;
        }
        
        @media (prefers-color-scheme: light) {
            .bookstaxx-spinner {
                border: 3px solid rgba(0, 0, 0, 0.1);
                border-top-color: #007AFF;
            }
        }
        
        .bookstaxx-loading-text {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
            margin-top: 4px;
        }
        
        .bookstaxx-error-message {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(220, 53, 69, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            font-size: 14px;
            transition: opacity 0.5s ease;
            max-width: 80%;
            text-align: center;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
        }
        
        .bookstaxx-success-message {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(40, 167, 69, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            font-size: 14px;
            transition: opacity 0.5s ease;
            max-width: 80%;
            text-align: center;
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
        }
        
        @keyframes bookstaxx-spin {
            to { transform: rotate(360deg); }
        }
    `;
}

async function showBookmarkIcons() {
    try {
        console.log("[showBookmarkIcons] 시작 (async)");
        
        // 화면 크기 및 마우스 위치 정보 계산
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        let mouseX = clickPosition.x;
        let mouseY = clickPosition.y;
        if (mouseX === undefined || mouseY === undefined || (mouseX === 0 && mouseY === 0)) {
            mouseX = screenWidth / 2;
            mouseY = screenHeight / 2;
            clickPosition = { x: mouseX, y: mouseY };
        }
        
        // 북마크바 표시 상태를 true로 설정 - 먼저 설정
        bookmarkBarVisible = true;
        
        // 북마크 컨테이너 확인 및 생성
        const container = ensureBookmarkContainer();
        
        // 기존 북마크 요소 제거
        removeAllBookmarkElements();

        // removeAllBookmarkElements()가 bookmarkBarVisible을 false로 설정하면서
        // 컨테이너의 active 클래스가 제거됩니다. 바로 다시 활성화 상태를 복구합니다.
        bookmarkBarVisible = true;
        if (container) {
            container.classList.add('active');
            container.setAttribute('data-visible', 'true');
        }

        // 북마크 컨테이너 표시 상태 재확인
        if (container) {
            console.log("[showBookmarkIcons] 북마크 컨테이너 표시 설정됨:", container.id);
            console.log("[showBookmarkIcons] 컨테이너 상태 - classes:", container.className,
                        "data-visible:", container.getAttribute('data-visible'));
            
            // 마우스 제거 모드가 timeout인 경우 자동 닫기 타이머 설정
            if (currentSettings.mouseCloseMode === 'timeout') {
                // 기존 타이머가 있으면 제거
                if (bookmarkBarAutoCloseTimer) {
                    clearTimeout(bookmarkBarAutoCloseTimer);
                    bookmarkBarAutoCloseTimer = null;
                }
                
                // 타임아웃 값 가져오기 (초 단위, 기본값 5초, 최대 60초)
                let timeoutSec = 5;
                if (typeof currentSettings.mouseCloseTimeout === 'number') {
                    timeoutSec = Math.max(1, Math.min(60, currentSettings.mouseCloseTimeout));
                } else if (typeof currentSettings.mouseCloseTimeout === 'string') {
                    timeoutSec = Math.max(1, Math.min(60, parseInt(currentSettings.mouseCloseTimeout, 10) || 5));
                }
                
                // 밀리초로 변환
                const timeoutMs = timeoutSec * 1000;
                
                console.log(`[showBookmarkIcons] 자동 닫기 타이머 설정: ${timeoutSec}초 후 닫힘`);
                
                // 새 타이머 설정
                bookmarkBarAutoCloseTimer = setTimeout(() => {
                    console.log("[showBookmarkIcons] 자동 닫기 타이머 실행: 북마크바 닫기");
                    removeBookmarkBar();
                }, timeoutMs);
            } else {
                // timeout 모드가 아닌 경우 기존 타이머 제거
                if (bookmarkBarAutoCloseTimer) {
                    clearTimeout(bookmarkBarAutoCloseTimer);
                    bookmarkBarAutoCloseTimer = null;
                }
            }
        } else {
            console.error("[showBookmarkIcons] 북마크 컨테이너를 찾거나 생성할 수 없습니다.");
            return; // 컨테이너가 없으면 진행 불가
        }
        
        // 로딩 스타일 및 인디케이터 추가 - 버튼 생성 전에 추가
        addLoadingStyles();
        const loadingIndicator = showLoadingIndicator(container);
        
        // 애니메이션 스타일 미리 준비
        addAnimationStyles();
        
        // 커스텀 버튼 생성 - 사용자 상호작용을 위한 기본 UI 요소 먼저 표시
        const defaultButtonSize = 56;
        const customButtonSize = 120; 
        const buttonMargin = 20;
        const buttonOffset = 100;
        
        try {
            const customIcons = await loadCustomButtonIcons();
            createCustomButton({
                type: 'back', customIcon: customIcons.backButtonIcon, defaultButtonSize, customButtonSize,
                mouseX: mouseX - buttonOffset, mouseY, screenWidth, screenHeight, buttonMargin,
                onClick: () => { window.history.back(); removeBookmarkBar(); }
            });
            createCustomButton({
                type: 'add', customIcon: customIcons.addButtonIcon, defaultButtonSize, customButtonSize,
                mouseX: mouseX + buttonOffset, mouseY, screenWidth, screenHeight, buttonMargin,
                onClick: () => { addCurrentPageToBookmarks(); }
            });
        } catch (error) {
            console.warn("커스텀 버튼 아이콘 로드 실패, 기본 아이콘 사용:", error);
            showDefaultBookmarkIcons(defaultButtonSize, buttonMargin, buttonOffset, mouseX, mouseY, screenWidth, screenHeight);
        }
        
        // 북마크 데이터 로드
        let receivedBookmarks;
        try {
            receivedBookmarks = await new Promise((resolve, reject) => {
                const startTime = performance.now();
                
                const timeoutId = setTimeout(() => {
                    reject(new Error("북마크 로드 시간 초과 (10초)"));
                }, 10000);
                
                try {
                    chrome.runtime.sendMessage({ action: "getBookmarks" }, function(response) {
                        clearTimeout(timeoutId);
                        const loadTime = performance.now() - startTime;
                        console.log(`북마크 로드 시간: ${loadTime.toFixed(1)}ms`);
                        
                        if (chrome.runtime.lastError) {
                            return reject(new Error("북마크 로드 중 오류: " + chrome.runtime.lastError.message));
                        }
                        if (!response || !response.success) {
                            return reject(new Error("북마크 로드 실패: " + (response ? response.error : "응답 없음")));
                        }
                        resolve(response.bookmarks);
                    });
                } catch (getBookmarksError) {
                    clearTimeout(timeoutId);
                    return reject(new Error("북마크 요청 중 연결 오류: " + getBookmarksError.message));
                }
            });
        } catch (error) {
            hideLoadingIndicator();
            console.error("북마크 로드 중 오류:", error);
            const errorMsg = chrome.i18n.getMessage("errorBookmarkLoadingGeneral", [error.message]) || "북마크를 불러오지 못했습니다: " + error.message;
            showErrorMessage(errorMsg);
            return;
        }
        
        // 북마크 처리 및 표시
        console.log("[showBookmarkIcons] 수신된 북마크 원본:", JSON.parse(JSON.stringify(receivedBookmarks)));
        
        if (!receivedBookmarks) {
            hideLoadingIndicator();
            showErrorMessage("표시할 북마크 데이터를 가져오지 못했습니다."); 
            console.error("[showBookmarkIcons] receivedBookmarks가 null 또는 undefined입니다.");
            return;
        }
        
        const allBookmarks = [];
        if (Array.isArray(receivedBookmarks)) {
            receivedBookmarks.forEach(folder => collectBookmarks(folder, allBookmarks));
        } else if (receivedBookmarks && typeof receivedBookmarks === 'object') {
            collectBookmarks(receivedBookmarks, allBookmarks);
        }
        
        console.log(`[showBookmarkIcons] 수집된 총 북마크 수: ${allBookmarks.length}`);
        console.log(`[showBookmarkIcons] 첫 5개 북마크 샘플:`, allBookmarks.slice(0, 5).map(b => ({title: b.title?.substring(0,15), url: b.url?.substring(0,30)})));
        
        if (allBookmarks.length === 0) {
            hideLoadingIndicator();
            showErrorMessage("표시할 북마크가 없습니다."); 
            console.log("[showBookmarkIcons] 표시할 북마크 없음.");
            return;
        }
        
        // 북마크 정렬 및 제한 - 설정 강제 로딩
        let maxBookmarks;
        let isSettingsLoadedFromStorage = false;
        
        if (currentSettings && currentSettings.maxBookmarks !== undefined) {
            maxBookmarks = typeof currentSettings.maxBookmarks === 'number' ? currentSettings.maxBookmarks : parseInt(currentSettings.maxBookmarks, 10);
        } else {
            // 설정이 로드되지 않은 경우 강제로 storage에서 모든 설정 가져옴
            try {
                const allStoredSettings = await new Promise((resolve, reject) => {
                    chrome.storage.sync.get(null, (result) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(result);
                        }
                    });
                });
                
                // 가져온 설정을 currentSettings에 즉시 적용
                if (allStoredSettings) {
                    currentSettings = { ...currentSettings, ...allStoredSettings };
                    maxBookmarks = typeof currentSettings.maxBookmarks === 'number' ? currentSettings.maxBookmarks : parseInt(currentSettings.maxBookmarks || '100', 10);
                    isSettingsLoadedFromStorage = true;
                    console.log('[강제 설정 로딩] storage에서 설정 로드 완료:', currentSettings);
                } else {
                    throw new Error('설정 로드 실패');
                }
            } catch (error) {
                console.warn('[강제 설정 로딩] 설정 로드 실패, 즉시 출현 격자형 모드로 폴백:', error);
                maxBookmarks = 100;
                // 설정 로딩 실패시 즉시 출현 격자형으로 강제 설정
                currentSettings = {
                    ...currentSettings,
                    bookmarkLayoutMode: 'grid',
                    bookmarkAnimationMode: 'instant', // 즉시 출현
                    maxBookmarks: 100,
                    bookmarkIconSize: '48',
                    showBookmarkTitles: true,
                    animationEnabled: false // 애니메이션 비활성화로 즉시 표시
                };
                isSettingsLoadedFromStorage = true;
                console.log('[폴백 모드] 즉시 출현 격자형 설정 적용:', currentSettings);
            }
        }
        const sortOrder = currentSettings.bookmarkSortOrder || 'recent';
        console.log(`[showBookmarkIcons] 설정 - maxBookmarks: ${maxBookmarks}, sortOrder: ${sortOrder}`);
        console.log(`[showBookmarkIcons] 원본 북마크 개수: ${allBookmarks.length}, 설정된 최대값: ${maxBookmarks}`);
        
        let sortedBookmarks;
        switch (sortOrder) {
            case 'name':
                sortedBookmarks = [...allBookmarks].sort((a, b) => (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase()));
                break;
            case 'recent':
            case 'custom': 
                sortedBookmarks = [...allBookmarks].reverse();
                break;
            case 'random':
                sortedBookmarks = [...allBookmarks].sort(() => Math.random() - 0.5);
                break;
            default:
                sortedBookmarks = [...allBookmarks].reverse();
        }
        
        // 원형 레이아웃에서 완전한 대칭을 위한 북마크 수 동적 계산
        let effectiveMaxBookmarks = maxBookmarks;
        if (currentSettings.bookmarkLayoutMode === 'circle') {
            // 완전한 원형 대칭을 위해 실제 표시 가능한 북마크 수를 미리 계산
            // 이 계산은 createPhysicsBookmarks 내부의 원형 레이아웃 로직과 동일해야 함
            const placementWidth = screenWidth;
            const placementHeight = screenHeight;
            const iconSizeValue = parseInt(currentSettings.bookmarkIconSize || '48', 10);
            // 화면 경계 안전 여백을 더 확보하여 북마크가 잘리지 않도록 수정
            const iconPadding = iconSizeValue + 20; // 아이콘 크기 + 안전 여백
            const maxRadius = Math.min(placementWidth - iconPadding, placementHeight - iconPadding) / 2 * 0.75;
            
            // 간격 계산 (createPhysicsBookmarks와 동일한 로직)
            let itemSpacingMultiplier = 1.0;
            if (iconSizeValue <= 32) {
                itemSpacingMultiplier = 3.0; // 작은 아이콘: 간격 대폭 증가로 가독성 향상
            } else if (iconSizeValue <= 48) {
                itemSpacingMultiplier = 2.0; // 중간 크기: 간격 증가로 깔끔한 배치
            } else {
                itemSpacingMultiplier = 1.6; // 큰 아이콘: 적절한 간격 유지
            }
            if (currentSettings.showBookmarkTitles) {
                itemSpacingMultiplier += 0.5; // 제목 표시 시 간격 더 증가
            }
            const itemSpacing = iconSizeValue * itemSpacingMultiplier;
            
            let radiusStepMultiplier = 1.0;
            if (iconSizeValue <= 32) {
                radiusStepMultiplier = 2.5; // 작은 아이콘: 원간 간격 대폭 증가
            } else if (iconSizeValue <= 48) {
                radiusStepMultiplier = 1.8; // 중간 크기: 원간 간격 증가
            } else {
                radiusStepMultiplier = 1.5; // 큰 아이콘: 적절한 원간 간격
            }
            const radiusStep = iconSizeValue * radiusStepMultiplier;
            
            // 완전한 원들의 용량 계산
            const circles = [];
            let currentRadius = radiusStep;
            while (currentRadius <= maxRadius) {
                const circumference = 2 * Math.PI * currentRadius;
                const itemsInThisCircle = Math.max(6, Math.floor(circumference / itemSpacing));
                circles.push(itemsInThisCircle);
                currentRadius += radiusStep;
            }
            
            // 사용자 편의성 우선 계산: 최대한 많은 북마크 표시 (거의 100개 근처까지)
            let calculatedCapacity = 0;
            let totalAvailableBookmarks = Math.min(maxBookmarks, sortedBookmarks.length);
            
            // 모든 원의 총 용량 계산
            const totalCircleCapacity = circles.reduce((sum, capacity) => sum + capacity, 0);
            console.log(`[Circle Layout] 원형 레이아웃 최대 용량: ${totalCircleCapacity}개, 요청된 북마크: ${totalAvailableBookmarks}개`);
            
            // 사용자 편의성 우선: 원형 용량보다 사용자 설정을 우선하되 합리적 범위 내에서
            if (totalAvailableBookmarks <= totalCircleCapacity) {
                // 모든 북마크를 표시할 수 있는 경우
                calculatedCapacity = totalAvailableBookmarks;
                console.log(`[Circle Layout] 모든 북마크 표시 가능: ${calculatedCapacity}개`);
            } else {
                // 사용자 설정을 최대한 존중 (원형 용량보다 우선)
                calculatedCapacity = Math.min(maxBookmarks, sortedBookmarks.length);
                console.log(`[Circle Layout] 사용자 설정 우선: ${calculatedCapacity}개 표시 (원형 용량: ${totalCircleCapacity}개 무시)`);
            }
            
            effectiveMaxBookmarks = calculatedCapacity;
            console.log(`[Circle Layout] 최종 결정: ${effectiveMaxBookmarks}개 북마크 표시`);
        } else {
            // 다른 레이아웃 모드에서는 사용자 설정 그대로 사용
            effectiveMaxBookmarks = maxBookmarks;
            const totalAvailableBookmarks = Math.min(maxBookmarks, sortedBookmarks.length);
            console.log(`[Other Layout] 사용자 편의성 우선 - 최대 북마크 수를 ${effectiveMaxBookmarks}개로 계산 (${totalAvailableBookmarks - effectiveMaxBookmarks}개만 숨김)`);
        }
        
        const bookmarksToDisplay = sortedBookmarks.slice(0, effectiveMaxBookmarks);
        console.log(`[showBookmarkIcons] 화면에 표시할 북마크 수: ${bookmarksToDisplay.length}, 목록:`, bookmarksToDisplay.map(b => b.title?.substring(0,10) + '...'));
        
        // 아이콘 크기에 따른 분리 거리 계산
        const iconSizeValue = parseInt(currentSettings.bookmarkIconSize || '48', 10);
        let separationMult = 1.8;
        if (iconSizeValue >= 48) separationMult = 2.2;
        if (iconSizeValue >= 64) separationMult = 2.8;
        if (currentSettings.showBookmarkTitles) separationMult += 0.5;
        
        // 물리 시뮬레이션 설정
        const physicsConfig = {
            friction: 0.7, mass: 1, stiffness: 0.6, gravity: 0.03, maxSpeed: 10, 
            collisionRadius: iconSizeValue * 0.8, 
            dampening: 0.95, 
            simulationSteps: (currentSettings.bookmarkLayoutMode === 'fullscreen' || currentSettings.bookmarkLayoutMode === 'grid' || currentSettings.bookmarkLayoutMode === 'circle') ? 0 : 2, 
            simulationSpeed: 1.0, 
            centerAttraction: currentSettings.bookmarkLayoutMode === 'fullscreen' ? 0.005 : 0.02,
            initialExplosionForce: 0, repulsionForce: 0.015, 
            minSeparationDistance: iconSizeValue * separationMult, 
            velocityDamping: 0.3, postSimulationPushes: 0, useVisuallyPleasingLayout: true,
            maxPositioningAttempts: 3, overlapThreshold: 0.7, 
            centerForceMultiplier: currentSettings.bookmarkLayoutMode === 'fullscreen' ? 0.1 : 1.5, 
            forceSymmetry: true
        };
        console.log("[showBookmarkIcons] 물리 엔진 설정:", physicsConfig);
        
        const adjustedCenterX = screenWidth / 2;
        const adjustedCenterY = screenHeight / 2;
        
        // 물리 북마크 객체 생성
        const result = await createPhysicsBookmarks(
            bookmarksToDisplay, 
            mouseX, 
            mouseY, 
            parseInt(currentSettings.bookmarkIconSize || '48', 10),
            physicsConfig
        );
        
        const physicsBookmarks = result.physicsObjects;
        const finalIconSize = result.adjustedIconSize;
        
        // 물리 북마크 시뮬레이션 실행
        console.log("[showBookmarkIcons] 생성된 물리 북마크 객체 수:", physicsBookmarks ? physicsBookmarks.length : 0);
        console.log("[showBookmarkIcons] 최종 아이콘 크기:", finalIconSize);
        if (physicsBookmarks && physicsBookmarks.length > 0) {
            // 모든 레이아웃에서 물리 시뮬레이션을 비활성화하고 계산된 초기 위치 사용
            console.log("[showBookmarkIcons] 물리 시뮬레이션 스킵 - 계산된 초기 위치 그대로 사용");
            console.log("[showBookmarkIcons] 레이아웃 모드:", currentSettings.bookmarkLayoutMode);
            
            // 로딩 인디케이터 숨기기 - 레이아웃 계산이 끝난 후
            hideLoadingIndicator();
            
            // 아이콘 배치 - 로딩 인디케이터가 사라진 후 표시 (조정된 크기 사용)
            console.log("[showBookmarkIcons] 중앙 재배치 후, 아이콘 배치 전");
            placeBookmarksWithPhysics(physicsBookmarks, mouseX, mouseY, finalIconSize);
            console.log("[showBookmarkIcons] 아이콘 배치 완료");
        } else {
            // 로딩 인디케이터 숨기기
            hideLoadingIndicator();
            
            if (bookmarksToDisplay.length > 0) {
                showErrorMessage("북마크를 배치하는 데 실패했습니다. 레이아웃 설정을 확인해주세요.");
                console.error("[showBookmarkIcons] physicsBookmarks 생성 실패 또는 비어있음.");
            }
        }
        
        preventAutoClose = true;
        setTimeout(() => { preventAutoClose = false; }, 500);
        
        // 북마크바 자동 닫힘 타이머 해제(중복 방지)
        if (bookmarkBarAutoCloseTimer) {
            clearTimeout(bookmarkBarAutoCloseTimer);
            bookmarkBarAutoCloseTimer = null;
        }
        // 북마크바 자동 닫힘 동작 (옵션 적용)
        if (currentSettings.mouseCloseMode === 'timeout') {
            let timeoutSec = 5;
            if (typeof currentSettings.mouseCloseTimeout === 'number') {
                timeoutSec = Math.max(1, Math.min(60, currentSettings.mouseCloseTimeout));
            } else if (typeof currentSettings.mouseCloseTimeout === 'string') {
                timeoutSec = Math.max(1, Math.min(60, parseInt(currentSettings.mouseCloseTimeout, 10) || 5));
            }
            if (bookmarkBarAutoCloseTimer) clearTimeout(bookmarkBarAutoCloseTimer);
            bookmarkBarAutoCloseTimer = setTimeout(() => {
                removeBookmarkBar();
            }, timeoutSec * 1000);
        }
        // 휠 이벤트 리스너 등록/해제
        const wheelContainer = document.getElementById(BOOKMARK_BAR_ID);
        if (wheelContainer) {
            wheelContainer.removeEventListener('wheel', handleBookmarkBarWheel);
            if (currentSettings.mouseCloseMode === 'wheel') {
                wheelContainer.addEventListener('wheel', handleBookmarkBarWheel, { passive: true });
            }
        }
    } catch (error) {
        // 오류 발생 시 로딩 인디케이터 숨기기
        hideLoadingIndicator();
        
        console.error("북마크 아이콘 표시 중 오류 (async):", error);
        if (typeof showErrorMessage === 'function') showErrorMessage("북마크 표시 중 오류가 발생했습니다: " + (error.message || error));
        if (!contextInvalidated) {
            contextInvalidated = true;
            if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in showBookmarkIcons catch block");
        }
    }
}

function calculateConcentricDistribution(totalItems, circleCount) {
    const distribution = new Array(circleCount).fill(0);
    if (totalItems === 0 || circleCount === 0) return distribution;
    if (circleCount === 1) {
        distribution[0] = totalItems;
        return distribution;
    }
    const areaRatios = [];
    let totalRatio = 0;
    for (let i = 0; i < circleCount; i++) {
        const ratio = Math.pow(i + 1, 2) - (i > 0 ? Math.pow(i, 2) : 0);
        areaRatios.push(ratio);
        totalRatio += ratio;
    }
    let remainingItems = totalItems;
    let sumForRatio = totalRatio;
    for (let i = 0; i < circleCount; i++) {
        if (sumForRatio === 0) { 
            distribution[i] = Math.ceil(remainingItems / (circleCount - i)); 
            } else {
            distribution[i] = Math.round(remainingItems * (areaRatios[i] / sumForRatio));
        }
        remainingItems -= distribution[i];
        sumForRatio -= areaRatios[i];
    }
    if (remainingItems > 0) distribution[circleCount - 1] += remainingItems;
    else if (remainingItems < 0) distribution[circleCount - 1] += remainingItems; 
    let currentSum = distribution.reduce((acc, val) => acc + val, 0);
    let diff = totalItems - currentSum;
    if (diff !== 0) distribution[circleCount - 1] += diff;
    return distribution;
}

function calculateCircleDistribution(totalItems, circleCount) {
    const distribution = new Array(circleCount).fill(0);
    if (totalItems === 0 || circleCount === 0) return distribution;
    if (circleCount === 1) {
        distribution[0] = totalItems;
        return distribution;
    }
    const ratios = [];
    for (let i = 0; i < circleCount; i++) {
        ratios[i] = (i + 1); 
    }
    const totalRatio = ratios.reduce((sum, ratio) => sum + ratio, 0);
    let remainingItems = totalItems;
    for (let i = 0; i < circleCount; i++) {
        const share = (i === circleCount - 1) ? remainingItems : Math.round((ratios[i] / totalRatio) * totalItems);
        distribution[i] = Math.min(share, remainingItems);
        remainingItems -= distribution[i];
    }
    if (remainingItems > 0) distribution[circleCount - 1] += remainingItems;
    return distribution;
}

function showSuccessMessage(messageKey, substitutions) {
    const existingMsg = document.querySelector('.bookstaxx-success-message');
    if (existingMsg && document.body && document.body.contains(existingMsg)) {
        document.body.removeChild(existingMsg);
    }
    let localizedMessage = '';
    try {
        localizedMessage = chrome.i18n.getMessage(messageKey, substitutions) || messageKey;
    } catch (e) { 
        localizedMessage = messageKey;
        console.warn(`Error getting message for key ${messageKey}:`, e);
    }
    const successMsg = document.createElement('div');
    successMsg.className = 'bookstaxx-success-message';
    successMsg.textContent = localizedMessage;
    if (document.body) document.body.appendChild(successMsg);
    else console.error("showSuccessMessage: document.body not found");
    setTimeout(() => {
        if (document.body && document.body.contains(successMsg)) {
            successMsg.style.opacity = '0';
            successMsg.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                if (document.body && document.body.contains(successMsg)) {
                    document.body.removeChild(successMsg);
                }
            }, 500);
        }
    }, 3000);
}

function addAnimationStyles() {
    let styleElement = document.getElementById('bookstaxx-animation-styles');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'bookstaxx-animation-styles';
        if (document.head) document.head.appendChild(styleElement);
        else console.error("addAnimationStyles: document.head not found");
    }
    const animationMode = currentSettings.bookmarkAnimationMode || 'shoot';
    const animationEnabled = currentSettings.animationEnabled !== false;
    let animationKeyframes = '';
    if (animationEnabled && animationMode !== 'none') {
        if (animationMode === 'shoot') {
            animationKeyframes = `
                @keyframes bookstaxx-shoot-out {
                    0% { transform: translate(var(--start-x), var(--start-y)) scale(0.1); opacity: 0; }
                    20% { opacity: 0.5; }
                    40% { opacity: 1; }
                    100% { transform: translate(var(--end-x), var(--end-y)) scale(1); opacity: 1; }
                }
                .bookstaxx-animate-shoot {
                    animation: bookstaxx-shoot-out 0.6s cubic-bezier(0.25, 0.1, 0.25, 1.4) forwards;
                    will-change: transform, opacity;
                }
            `;
        } else if (animationMode === 'sequence' || animationMode === 'sequential') {
            animationKeyframes = `
                @keyframes bookstaxx-sequence {
                    0% { transform: translate(var(--start-x), var(--start-y)) scale(0.1); opacity: 0; }
                    30% { opacity: 0.7; transform: scale(1.1) translate(var(--end-x), var(--end-y)); }
                    100% { transform: translate(var(--end-x), var(--end-y)) scale(1); opacity: 1; }
                }
                .bookstaxx-animate-sequence {
                    animation: bookstaxx-sequence 0.8s cubic-bezier(0.25, 0.1, 0.25, 1.4) forwards;
                    will-change: transform, opacity;
                }
            `;
        } else if (animationMode === 'list') {
            animationKeyframes = `
                @keyframes bookstaxx-list {
                    0% { transform: translate(var(--start-x), var(--start-y)) scale(0.1); opacity: 0; }
                    100% { transform: translate(var(--end-x), var(--end-y)) scale(1); opacity: 1; }
                }
                .bookstaxx-animate-list {
                    animation: bookstaxx-list 0.6s ease forwards;
                    will-change: transform, opacity;
                }
            `;
        }
    } else {
        animationKeyframes = `
            .bookstaxx-animate-shoot, .bookstaxx-animate-sequence, .bookstaxx-animate-list {
                opacity: 1;
                transform: translate(var(--end-x, 0px), var(--end-y, 0px)) scale(1);
                will-change: auto; /* 애니메이션 없을 때는 will-change 최적화 해제 */
            }
        `;
    }
    if (styleElement) styleElement.textContent = animationKeyframes;
}

function setBookmarkAnimation(element, startX, startY, endX, endY, index) {
    try {
        if (!element) {
            console.error("setBookmarkAnimation: element is null or undefined");
            return;
        }
        
        if (DEBUG_MODE) console.log(`setBookmarkAnimation: 인덱스 ${index}, 시작 (${startX}, ${startY}), 끝 (${endX}, ${endY})`);
        
        // 애니메이션 비활성화인 경우 즉시 표시
        if (!currentSettings.animationEnabled) {
            if (DEBUG_MODE) console.log("애니메이션이 비활성화되어 있어 즉시 표시합니다.");
            const halfSize = parseInt(currentSettings.bookmarkIconSize || '48', 10) / 2;
            element.style.left = `${endX - halfSize}px`;
            element.style.top = `${endY - halfSize}px`;
            element.style.opacity = '1';
            element.style.transform = 'scale(1)';
            return;
        }
        
        // 애니메이션 모드 설정
        const animationMode = currentSettings.bookmarkAnimationMode || 'shoot';
        
        // 즉시 출현 모드 추가
        if (animationMode === 'none') {
            if (DEBUG_MODE) console.log("즉시 출현 모드로 표시합니다.");
            const halfSize = parseInt(currentSettings.bookmarkIconSize || '48', 10) / 2;
            element.style.left = `${endX - halfSize}px`;
            element.style.top = `${endY - halfSize}px`;
            element.style.opacity = '1';
            element.style.transform = 'scale(1)';
            return;
        }
        
        // 마우스 클릭 위치를 시작점으로 사용
        const mouseX = clickPosition.x;
        const mouseY = clickPosition.y;
        
        if (DEBUG_MODE) console.log(`애니메이션 모드: ${animationMode}, 마우스 위치: (${mouseX}, ${mouseY})`);
        
        // 기본 위치 설정 (아이콘 중심 기준)
        const halfSize = parseInt(currentSettings.bookmarkIconSize || '48', 10) / 2;
        element.style.left = `${endX - halfSize}px`;
        element.style.top = `${endY - halfSize}px`;
        
        // 시작 및 끝 위치 계산
        const startOffsetX = mouseX - endX;
        const startOffsetY = mouseY - endY;
        
        // CSS 변수 설정
        element.style.setProperty('--start-x', `${startOffsetX}px`);
        element.style.setProperty('--start-y', `${startOffsetY}px`);
        element.style.setProperty('--end-x', '0px');
        element.style.setProperty('--end-y', '0px');
        
        // 애니메이션 수행에 will-change 속성 추가로 성능 향상
        element.style.willChange = 'transform, opacity';
        element.style.opacity = '0'; // 시작 상태는 투명
        
        // CSS 애니메이션 클래스 분리하여 각 모드별로 적용
        switch (animationMode) {
            case 'shoot':
                element.classList.add('bookstaxx-animate-shoot');
                break;
                
            case 'sequence':
            case 'sequential':
                // delay 적용
                element.style.animationDelay = `${index * 50}ms`;
                element.classList.add('bookstaxx-animate-sequence');
                break;
                
            case 'list':
                // delay 적용
                element.style.animationDelay = `${index * 30}ms`;
                element.classList.add('bookstaxx-animate-list');
                break;
                
            default:
                // 기본 애니메이션 (발사)
                element.classList.add('bookstaxx-animate-shoot');
        }
        
        // 애니메이션 완료 후 will-change 속성 제거
        const animationDuration = (animationMode === 'sequence' || animationMode === 'sequential') ? 800 : 600;
        const totalDelay = index * (animationMode === 'list' ? 30 : 50) + animationDuration + 100; // 약간의 여유 추가
        
        setTimeout(() => {
            element.style.willChange = 'auto';
        }, totalDelay);
    } catch (error) {
        console.error("북마크 애니메이션 적용 중 오류:", error);
        // 오류 발생시 기본 표시
        if (element) {
            element.style.left = `${endX}px`;
            element.style.top = `${endY}px`;
            element.style.opacity = '1';
        }
    }
}

function checkExtensionContext() {
    if (contextInvalidated) return; 
    if (Date.now() - lastSuccessfulContextCheck < 15000) return; 

    try {
        if (chrome && chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({ action: "ping", silent: true }, (response) => {
                if (chrome.runtime.lastError) {
                    if (!contextInvalidated) {
                        console.warn("확장 컨텍스트 무효화 감지 (ping 응답 오류)", chrome.runtime.lastError.message);
            contextInvalidated = true;
                        if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in checkExtensionContext (ping error)");
                    }
                } else if (response && response.success) {
                    lastSuccessfulContextCheck = Date.now();
                    contextInvalidated = false; 
                } else {
                    if (!contextInvalidated) {
                         console.warn("확장 컨텍스트 무효화 감지 (ping 응답 실패)");
                    contextInvalidated = true;
                         if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in checkExtensionContext (ping fail)");
                    }
                }
            });
                    } else {
            if (!contextInvalidated) {
                console.warn("확장 컨텍스트 무효화 감지 (API 접근 불가)");
                contextInvalidated = true;
                if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in checkExtensionContext (API access)");
            }
        }
    } catch (e) {
        if (!contextInvalidated) {
            console.warn("확장 컨텍스트 확인 중 예외:", e);
            contextInvalidated = true;
            if (typeof tryRecoverContext === 'function') tryRecoverContext(); else console.error("tryRecoverContext is not defined in checkExtensionContext (catch)");
        }
    }
    if (checkContextTimer) clearTimeout(checkContextTimer);
    checkContextTimer = setTimeout(checkExtensionContext, 20000); 
}

function addCurrentPageToBookmarks() {
    chrome.runtime.sendMessage(
        { action: "addBookmark", title: document.title, url: window.location.href },
        (response) => {
                        if (chrome.runtime.lastError) {
                console.error("북마크 추가 중 오류:", chrome.runtime.lastError.message);
                if(typeof showErrorMessage === 'function') showErrorMessage("errorAddingBookmark", { error: chrome.runtime.lastError.message });
                            return;
                        }
                        if (response && response.success) {
                if (response.message === "이미 북마크에 추가되어 있습니다.") {
                    if(typeof showSuccessMessage === 'function') showSuccessMessage("bookmarkAlreadyExists");
                        } else {
                    if(typeof showSuccessMessage === 'function') showSuccessMessage("bookmarkAddedSuccess");
                }
                 if (currentSettings.autoCloseAfterSelect) {
                    removeBookmarkBar();
                }
            } else {
                if(typeof showErrorMessage === 'function') showErrorMessage("errorAddingBookmark", { error: response.error || "알 수 없는 오류" });
            }
        }
    );
}

function openBookmarkByIndex(index) {
    console.log(`[Keyboard Shortcut] 북마크 인덱스 ${index} 열기 시도`);
    
    // 북마크바가 열려있지 않은 경우 먼저 열기
    if (!bookmarkBarVisible) {
        console.log('[Keyboard Shortcut] 북마크바가 닫혀있어 먼저 열기');
        toggleBookmarkBar();
        // 북마크바가 열린 후 약간의 지연을 두고 북마크 열기
        setTimeout(() => openBookmarkByIndexAfterLoad(index), 500);
        return;
    }
    
    openBookmarkByIndexAfterLoad(index);
}

function openBookmarkByIndexAfterLoad(index) {
    // 현재 표시된 북마크 아이콘들을 찾기
    const bookmarkIcons = document.querySelectorAll('.bookstaxx-bookmark-icon');
    
    if (bookmarkIcons.length === 0) {
        console.log(`[Keyboard Shortcut] 표시된 북마크가 없음`);
        if(typeof showErrorMessage === 'function') showErrorMessage("북마크가 표시되지 않았습니다.");
        return;
    }
    
    if (index >= bookmarkIcons.length) {
        console.log(`[Keyboard Shortcut] 인덱스 ${index}가 북마크 수(${bookmarkIcons.length})를 초과함`);
        if(typeof showErrorMessage === 'function') showErrorMessage(`${index + 1}번째 북마크가 없습니다. (총 ${bookmarkIcons.length}개)`);
        return;
    }
    
    const targetBookmark = bookmarkIcons[index];
    const url = targetBookmark.getAttribute('data-url');
    
    if (!url) {
        console.error(`[Keyboard Shortcut] 북마크 ${index}의 URL을 찾을 수 없음`);
        if(typeof showErrorMessage === 'function') showErrorMessage("북마크 URL을 찾을 수 없습니다.");
        return;
    }
    
    console.log(`[Keyboard Shortcut] 북마크 ${index} (${url}) 열기`);
    
    // 북마크 클릭 이벤트 시뮬레이션
    targetBookmark.click();
}

// 지연 로딩을 위한 준비 상태 체크
function checkContentReady() {
    if (document.readyState === 'complete' || (document.readyState === 'interactive' && document.body)) {
        isContentReady = true;
        processPendingActions();
        return true;
    }
    return false;
}

// 대기 중인 액션 처리
function processPendingActions() {
    if (pendingActions.length > 0) {
        if (DEBUG_MODE) console.log(`${pendingActions.length}개의 대기 중인 액션 처리`);
        const actions = [...pendingActions];
        pendingActions.length = 0; // 배열 비우기
        actions.forEach(action => {
            try {
                action();
            } catch (error) {
                console.error("대기 중인 액션 실행 오류:", error);
            }
        });
    }
}

// 빠른 초기화 - 필수 요소만 먼저 로드
function quickInitialize() {
    if (isInitialized) return;
    
    if (DEBUG_MODE) console.log("BookStaxx 빠른 초기화 시작");
    
    // 기본 설정 적용
    currentSettings = {...defaultSettings};
    
    // 필수 이벤트 리스너만 등록
    registerCriticalEventListeners();
    
    // 컨테이너 미리 생성
    ensureBookmarkContainer();
    
    // 캐시된 설정이 있다면 즉시 적용
    if (settingsCache) {
        currentSettings = {...settingsCache};
    }
    
    isInitialized = true;
    isContentReady = checkContentReady();
    
    if (DEBUG_MODE) console.log("BookStaxx 빠른 초기화 완료");
}

// 핵심 이벤트 리스너만 먼저 등록
function registerCriticalEventListeners() {
    document.removeEventListener('mousedown', handleDocumentClick);
    document.addEventListener('mousedown', handleDocumentClick, true);
}

// --- 주요 초기화 함수 (성능 최적화됨) --- 
function initializeBookStaxx() {
    try {
        if (DEBUG_MODE) console.log("BookStaxx 완전 초기화 시작");
        
        if (contextInvalidated) {
            if (DEBUG_MODE) console.log("컨텍스트가 무효화된 상태에서 초기화 시도 - 복구 먼저 진행");
            if (typeof tryRecoverContext === 'function') tryRecoverContext(); 
            return;
        }
        
        if (typeof chrome === 'undefined' || !chrome.runtime) {
            if (DEBUG_MODE) console.error("초기화 실패: chrome 객체 또는 runtime API에 접근할 수 없습니다.");
            contextInvalidated = true;
            if (typeof tryRecoverContext === 'function') tryRecoverContext();
            return;
        }
        
        contextInvalidated = false;
        recoveryAttempts = 0;
        
        // 빠른 초기화가 아직 안되었다면 먼저 실행
        if (!isInitialized) {
            quickInitialize();
        }
        
        // 캐시된 설정 로드 시도
        loadAppSettingsFromCache().then(() => {
            continueFullInitialization();
        }).catch(error => {
            if (DEBUG_MODE) console.error("설정 로드 오류:", error);
            continueFullInitialization();
        });
        
    } catch (error) {
        if (DEBUG_MODE) console.error("BookStaxx 초기화 중 오류:", error);
        if (!contextInvalidated) {
            contextInvalidated = true;
            if (typeof tryRecoverContext === 'function') tryRecoverContext();
        }
    }
    
    // 완전 초기화의 나머지 부분을 처리하는 함수
    function continueFullInitialization() {
        // 전체 이벤트 리스너 등록
        registerEventListeners();
        lastSuccessfulContextCheck = Date.now();
        
        // 비동기 작업들을 백그라운드에서 실행
        setTimeout(() => {
            checkExtensionContext();
            preloadCustomIcons();
            applyGlobalCustomCursor();
        }, 100);
        
        if (DEBUG_MODE) console.log("BookStaxx 완전 초기화 완료");
    }
}

// --- 초기 실행 로직 (성능 최적화됨) ---
// 빠른 응답을 위해 즉시 빠른 초기화 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', quickInitialize);
} else {
    quickInitialize();
}

// 완전 초기화는 좀 더 지연시켜 실행
if (document.readyState === 'complete') {
    setTimeout(initializeBookStaxx, 100);
} else {
    window.addEventListener('load', function() {
        setTimeout(initializeBookStaxx, 500); // 지연 시간 단축
    });
}

// 폴백 - 일정 시간 후 강제 확인
setTimeout(() => {
    if (!isInitialized) {
        if (DEBUG_MODE) console.log("강제 초기화 시도");
        quickInitialize();
        setTimeout(initializeBookStaxx, 100);
    }
}, 2000);
// 이 아래로는 아무 내용도 없어야 합니다.

// 북마크바에 특화된 이벤트 리스너 추가 (휠 이벤트 등)
function setupBookmarkBarEvents() {
    try {
        // 전역 문서 이벤트에 휠 클릭 이벤트 별도 추가
        document.removeEventListener('wheel', handleBookmarkBarWheel);
        document.addEventListener('wheel', handleBookmarkBarWheel, { passive: false, capture: true });
        
        // 북마크바가 보일 때 ESC 키로 닫기 이벤트
        const handleEscKey = (event) => {
            if (bookmarkBarVisible && event.key === 'Escape') {
                console.log("[handleEscKey] ESC 키로 북마크바 닫기");
                event.preventDefault();
                event.stopPropagation();
                removeBookmarkBar();
            }
        };
        
        // 키보드 이벤트 리스너도 추가
        document.removeEventListener('keydown', handleEscKey);
        document.addEventListener('keydown', handleEscKey, true);
        
        console.log("[setupBookmarkBarEvents] 북마크바 이벤트 리스너 설정 완료");
    } catch (error) {
        console.error("[setupBookmarkBarEvents] 이벤트 설정 중 오류:", error);
    }
}

// --- Favicon 캐싱 유틸 ---
function getCachedFavicon(url, size = 64, callback) {
    if (!url || typeof callback !== 'function') { callback(''); return; }
    const key = 'favicon_' + url;
    try {
        chrome.storage.local.get([key], (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                callback('https://www.google.com/s2/favicons?sz=' + size + '&domain_url=' + encodeURIComponent(url));
                return;
            }
            if (result && result[key]) {
                callback(result[key]);
            } else {
                const serviceUrl = 'https://www.google.com/s2/favicons?sz=' + size + '&domain_url=' + encodeURIComponent(url);
                callback(serviceUrl);
                
                // CORS 문제를 피하기 위해 background script를 통해 favicon 가져오기
                safeSendMessage({
                    action: 'fetchFavicon',
                    url: serviceUrl,
                    cacheKey: key
                }, null); // 응답은 필요하지 않음
            }
        });
    } catch (e) {
        callback('https://www.google.com/s2/favicons?sz=' + size + '&domain_url=' + encodeURIComponent(url));
    }
}