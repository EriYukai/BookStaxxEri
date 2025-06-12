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
    
    // 1.5. console.warn 오버라이드 - 언어 관련 경고 억제
    const originalWarn = console.warn;
    console.warn = function(...args) {
        const warnMessage = args.join(' ');
        const isLanguageWarning = warnMessage.includes('[BookStaxx applyLanguage]') ||
                                warnMessage.includes('번역 파일 가져오기 번역:') ||
                                warnMessage.includes('for lang');
        
        if (!isLanguageWarning) {
            originalWarn.apply(console, args);
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

// Enhanced message retrieval for Firefox
function getStoredMessage(key) {
    try {
        // Try to get current language
        const currentLanguage = getCurrentLanguage();
        
        // Try to get from chrome storage
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([`i18n_${currentLanguage}`], (result) => {
                const messages = result[`i18n_${currentLanguage}`];
                if (messages && messages[key]) {
                    return messages[key].message;
                }
            });
        }
    } catch (error) {
        console.warn('getStoredMessage error:', error);
    }
    return '';
}

function getCurrentLanguage() {
    // Get browser language or fallback
    if (chrome && chrome.i18n && chrome.i18n.getUILanguage) {
        const browserLang = chrome.i18n.getUILanguage().toLowerCase();
        if (browserLang.startsWith('ko')) return 'ko';
        if (browserLang.startsWith('ja')) return 'ja';
        if (browserLang.startsWith('zh')) return 'zh_CN';
        if (browserLang.startsWith('es')) return 'es';
        if (browserLang.startsWith('fr')) return 'fr';
        if (browserLang.startsWith('de')) return 'de';
        if (browserLang.startsWith('ru')) return 'ru';
        if (browserLang.startsWith('pt')) return 'pt_BR';
        if (browserLang.startsWith('hi')) return 'hi';
    }
    return 'en'; // fallback to English
}

// Firefox i18n compatibility fix
(function setupFirefoxI18nCompatibility() {
    // Ensure chrome.i18n is available in Firefox
    if (typeof browser !== 'undefined' && typeof chrome !== 'undefined') {
        if (!chrome.i18n || !chrome.i18n.getMessage) {
            chrome.i18n = browser.i18n;
        }
    }
    
    // Create enhanced getMessage function with better fallback
    const originalGetMessage = chrome.i18n ? chrome.i18n.getMessage : null;
    
    if (chrome.i18n) {
        chrome.i18n.getMessage = function(key, substitutions) {
            try {
                const result = originalGetMessage ? originalGetMessage.call(this, key, substitutions) : '';
                if (result && result.trim()) {
                    return result;
                }
            } catch (error) {
                console.warn('Firefox i18n getMessage error:', error);
            }
            
            // Enhanced fallback: try to get from stored messages
            return getStoredMessage(key) || '';
        };
    }
})();

// Constants
const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh_CN', 'es', 'fr', 'de', 'ru', 'pt_BR', 'hi'];

const optionsForm = document.getElementById('options-form');
const statusDiv = document.getElementById('status');

// Input elements
const bookmarkIconSizeSelect = document.getElementById('bookmarkIconSize');
const bookmarkFontSizeSelect = document.getElementById('bookmarkFontSize');
const bookmarkLayoutModeSelect = document.getElementById('bookmarkLayoutMode');
const bookmarkAnimationModeSelect = document.getElementById('bookmarkAnimationMode');
const bookmarkSortOrderSelect = document.getElementById('bookmarkSortOrder');
const bookmarkOpenModeSelect = document.getElementById('bookmarkOpenMode');
const maxBookmarksInput = document.getElementById('maxBookmarks');
const backButtonIconInput = document.getElementById('backButtonIcon');
const addButtonIconInput = document.getElementById('addButtonIcon');
const animationEnabledCheckbox = document.getElementById('animationEnabled');
const mouseCursorIconInput = document.getElementById('mouseCursorIcon');
const mouseCursorSizeSelect = document.getElementById('mouseCursorSize'); // 마우스 커서 크기 선택 요소
const showBookmarkTitlesCheckbox = document.getElementById('showBookmarkTitles'); // 북마크 제목 표시 여부 체크박스
const languageSelector = document.getElementById('languageSelector'); // 언어 선택 요소
const customLayoutButton = document.getElementById('customLayoutButton'); // 커스텀 레이아웃 버튼 참조
// const scrollButtonIconInput = document.getElementById('scrollButtonIcon'); // Currently disabled
const mouseCloseModeSelect = document.getElementById('mouseCloseMode');
const mouseCloseTimeoutInput = document.getElementById('mouseCloseTimeout');
const mouseCloseTimeoutContainer = document.getElementById('mouseCloseTimeoutContainer');
const bookmarkHotkeySelect = document.getElementById('bookmarkHotkey');

// Preview elements
const backButtonPreview = document.getElementById('backButtonPreview');
const addButtonPreview = document.getElementById('addButtonPreview');
const mouseCursorPreview = document.getElementById('mouseCursorPreview');

// Import section elements
const initialImportSection = document.getElementById('initial-import-section');
const importFolderListDiv = document.getElementById('import-folder-list');
const startImportButton = document.getElementById('start-import-button');
const skipImportButton = document.getElementById('skip-import-button');
const importStatusDiv = document.getElementById('import-status');
// 북마크 불러오기 버튼 요소 추가
const showImportButton = document.getElementById('show-import-button');
// 추가된 요소들
const selectAllButton = document.getElementById('select-all-button');
const deselectAllButton = document.getElementById('deselect-all-button');
const selectedFoldersCount = document.getElementById('selected-folders-count');

// 이미지 재설정 및 모든 설정 초기화 버튼
const resetMouseCursorIconBtn = document.getElementById('resetMouseCursorIconBtn');
const resetBackButtonIconBtn = document.getElementById('resetBackButtonIconBtn');
const resetAddButtonIconBtn = document.getElementById('resetAddButtonIconBtn');
const resetAllSettingsBtn = document.getElementById('resetAllSettingsBtn');

// Default settings - 스크린샷의 현재 상태로 설정
const DEFAULT_SETTINGS = {
    bookmarkIconSize: '64', // 스크린샷 상태: 크기 (64px)
    bookmarkFontSize: '12', // 스크린샷 상태: 작은 (12px)
    maxBookmarks: 100, // 스크린샷 상태: 100개
    animationEnabled: true,
    bookmarkLayoutMode: 'circle',
    bookmarkAnimationMode: 'shoot',
    bookmarkSortOrder: 'recent',
    bookmarkOpenMode: 'new',
    mouseCursorBase64: '',
    backButtonBase64: '',
    addButtonBase64: '',
    mouseCursorSize: 'normal', // 기본 마우스 커서 크기: 보통
    showBookmarkTitles: true, // 기본적으로 북마크 제목 표시
    selectedLanguage: 'auto', // 기본 언어 설정: 자동
    mouseCloseMode: 'button', // 기본값: 마우스버튼
    mouseCloseTimeout: 5,     // 기본값: 5초
    bookmarkHotkey: 'ctrl+shift+a', // 북마크 단축키 기본값을 Ctrl+Shift+A로 변경
};

// --- Functions --- 

// Saves options to chrome.storage.sync
function saveOptions(e) {
    e.preventDefault();
    
    try {
        const settingsToSave = {
            bookmarkIconSize: bookmarkIconSizeSelect.value,
            bookmarkFontSize: bookmarkFontSizeSelect.value,
            bookmarkLayoutMode: bookmarkLayoutModeSelect.value,
            bookmarkAnimationMode: bookmarkAnimationModeSelect.value,
            bookmarkSortOrder: bookmarkSortOrderSelect.value,
            bookmarkOpenMode: bookmarkOpenModeSelect.value,
            maxBookmarks: parseInt(maxBookmarksInput.value, 10),
            animationEnabled: animationEnabledCheckbox.checked,
            mouseCursorSize: mouseCursorSizeSelect.value,
            showBookmarkTitles: showBookmarkTitlesCheckbox.checked,
            selectedLanguage: languageSelector ? languageSelector.value : 'auto',
            mouseCloseMode: mouseCloseModeSelect ? mouseCloseModeSelect.value : 'button',
            mouseCloseTimeout: mouseCloseTimeoutInput ? parseInt(mouseCloseTimeoutInput.value, 10) : 5,
            bookmarkHotkey: bookmarkHotkeySelect ? bookmarkHotkeySelect.value : 'none',
        };

        console.log("저장할 설정:", settingsToSave);

        chrome.storage.sync.set(settingsToSave, function() {
            if (chrome.runtime.lastError) {
                console.error("설정 저장 오류:", chrome.runtime.lastError);
                showStatusMessage(getLocalizedMessage('settingsSaveError', [chrome.runtime.lastError.message]), 'error');
                return;
            }
            showStatusMessage(getLocalizedMessage('settingsSavedSuccess'), 'success');
            applyLanguage(settingsToSave.selectedLanguage).catch(error => console.error('Error applying language:', error)); // 저장 후 즉시 언어 적용
            // content.js에 옵션 변경 알림
            if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: 'settingsChanged', settings: settingsToSave });
            }
        });

        // 파일 입력 처리 (이 부분은 settingsToSave와 별개로 Base64 저장 로직을 따름)
        if (backButtonIconInput.files && backButtonIconInput.files.length > 0) {
            handleFileInput(backButtonIconInput, 'backButtonIcon');
        }
        if (addButtonIconInput.files && addButtonIconInput.files.length > 0) {
            handleFileInput(addButtonIconInput, 'addButtonIcon');
        }
        if (mouseCursorIconInput.files && mouseCursorIconInput.files.length > 0) {
            handleFileInput(mouseCursorIconInput, 'mouseCursorIcon');
        }
    } catch (error) {
        console.error("설정 저장 중 예외 발생:", error);
        showStatusMessage(getLocalizedMessage('settingsSaveError', [error.message]), 'error');
    }
}

// 북마크 정렬 방식 변경 시 커스텀 레이아웃 버튼 상태 업데이트 함수
function updateCustomLayoutButtonState() {
    const customLayoutButton = document.getElementById('customLayoutButton');
    const bookmarkSortOrderSelect = document.getElementById('bookmarkSortOrder');
    
    if (customLayoutButton && bookmarkSortOrderSelect) {
        const isCustomSortOrder = bookmarkSortOrderSelect.value === 'custom';
        customLayoutButton.disabled = !isCustomSortOrder;
        customLayoutButton.style.opacity = isCustomSortOrder ? '1' : '0.5';
        customLayoutButton.style.cursor = isCustomSortOrder ? 'pointer' : 'not-allowed';
    }
}

// 원형 레이아웃 설명의 표시/숨김을 처리하는 함수
function updateCircleLayoutDescriptionVisibility() {
    const circleLayoutDescription = document.getElementById('circleLayoutDescription');
    const bookmarkLayoutModeSelect = document.getElementById('bookmarkLayoutMode');
    
    if (circleLayoutDescription && bookmarkLayoutModeSelect) {
        const isCircleMode = bookmarkLayoutModeSelect.value === 'circle';
        circleLayoutDescription.style.display = isCircleMode ? 'block' : 'none';
    }
}

// Restore options from chrome.storage
function restoreOptions() {
    chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS), function(result) {
        console.log("로드된 설정:", result);
        
        // 기본값과 로드된 값을 병합하여 빈 값이 없도록 보장
        const mergedSettings = {...DEFAULT_SETTINGS, ...result};
        console.log("병합된 설정:", mergedSettings);
        
        if(bookmarkIconSizeSelect) bookmarkIconSizeSelect.value = mergedSettings.bookmarkIconSize || DEFAULT_SETTINGS.bookmarkIconSize;
        if(bookmarkFontSizeSelect) bookmarkFontSizeSelect.value = mergedSettings.bookmarkFontSize || DEFAULT_SETTINGS.bookmarkFontSize;
        if(showBookmarkTitlesCheckbox) showBookmarkTitlesCheckbox.checked = mergedSettings.showBookmarkTitles !== undefined ? mergedSettings.showBookmarkTitles : DEFAULT_SETTINGS.showBookmarkTitles;
        if(maxBookmarksInput) maxBookmarksInput.value = mergedSettings.maxBookmarks || DEFAULT_SETTINGS.maxBookmarks;
        if(document.getElementById('maxBookmarksValue')) document.getElementById('maxBookmarksValue').textContent = mergedSettings.maxBookmarks || DEFAULT_SETTINGS.maxBookmarks;
        if(animationEnabledCheckbox) animationEnabledCheckbox.checked = mergedSettings.animationEnabled !== undefined ? mergedSettings.animationEnabled : DEFAULT_SETTINGS.animationEnabled;
        if(bookmarkLayoutModeSelect) bookmarkLayoutModeSelect.value = mergedSettings.bookmarkLayoutMode || DEFAULT_SETTINGS.bookmarkLayoutMode;
        if(bookmarkAnimationModeSelect) bookmarkAnimationModeSelect.value = mergedSettings.bookmarkAnimationMode || DEFAULT_SETTINGS.bookmarkAnimationMode;
        if(bookmarkSortOrderSelect) bookmarkSortOrderSelect.value = mergedSettings.bookmarkSortOrder || DEFAULT_SETTINGS.bookmarkSortOrder;
        if(bookmarkOpenModeSelect) bookmarkOpenModeSelect.value = mergedSettings.bookmarkOpenMode || DEFAULT_SETTINGS.bookmarkOpenMode;
        if(mouseCursorSizeSelect) mouseCursorSizeSelect.value = mergedSettings.mouseCursorSize || DEFAULT_SETTINGS.mouseCursorSize;
        
        const currentLang = mergedSettings.selectedLanguage || DEFAULT_SETTINGS.selectedLanguage;
        if (languageSelector) {
            languageSelector.value = currentLang;
        }
        applyLanguage(currentLang).catch(error => console.error('Error applying language:', error));
        updateImagePreviews();
        if (mouseCloseModeSelect) mouseCloseModeSelect.value = mergedSettings.mouseCloseMode || DEFAULT_SETTINGS.mouseCloseMode;
        if (mouseCloseTimeoutInput) mouseCloseTimeoutInput.value = mergedSettings.mouseCloseTimeout || DEFAULT_SETTINGS.mouseCloseTimeout;
        // 슬라이더 표시/숨김
        if (mouseCloseModeSelect && mouseCloseTimeoutContainer) {
            mouseCloseTimeoutContainer.style.display = (mouseCloseModeSelect.value === 'timeout') ? '' : 'none';
        }
        if (bookmarkHotkeySelect) bookmarkHotkeySelect.value = mergedSettings.bookmarkHotkey || DEFAULT_SETTINGS.bookmarkHotkey;
        
        // 커스텀 레이아웃 버튼 상태 업데이트 (설정 로드 후)
        updateCustomLayoutButtonState();
        // 원형 레이아웃 설명 표시/숨김 업데이트 (설정 로드 후)
        updateCircleLayoutDescriptionVisibility();
    });
}

// 파일 입력 처리 함수 (최적화된 버전)
function handleFileInput(inputElement, storageKey) {
    if (!inputElement || !inputElement.files || inputElement.files.length === 0) {
        console.log(`${storageKey}: 선택된 파일 없음`);
        return;
    }
    
    console.log(`${storageKey} 파일 처리 중...`);
    const file = inputElement.files[0];
    
    // 파일 크기 로깅
    console.log(`${storageKey} 원본 파일 크기: ${(file.size / 1024).toFixed(2)}KB`);
    
    // 이미지를 최적화하고 크기를 자동 조정
    optimizeImage(file, storageKey)
        .then(optimizedDataUrl => {
            // 최적화된 이미지 저장
            splitAndStoreBase64(optimizedDataUrl, storageKey)
                .then(() => {
                    console.log(`${storageKey} 저장 완료`);
                    
                    // 해당 미리보기 이미지에 설정
                    const previewId = `${storageKey.replace('Icon', '')}Preview`;
                    const previewElement = document.getElementById(previewId);
                    const noPreviewElement = document.getElementById(`${previewId}NoPreview`);
                    
                    if (previewElement) {
                        previewElement.src = optimizedDataUrl;
                        previewElement.classList.remove('hidden');
                        
                        // noPreviewElement가 있는 경우에만 hidden 클래스 추가
                        if (noPreviewElement) {
                            noPreviewElement.classList.add('hidden');
                        }
                    }
                    
                    // 커스텀 이미지 상태 업데이트
                    updateCustomImageStatus();
                    
                    showStatusMessage(chrome.i18n.getMessage('imageOptimizedSaved') || 'Image optimized and saved.', 'success');
                })
                .catch(error => {
                    console.error(`${storageKey} 저장 오류:`, error);
                    showStatusMessage((chrome.i18n.getMessage('imageSaveError') || 'Error saving image: ') + error.message, 'error');
                });
        })
        .catch(error => {
            console.error(`${storageKey} 이미지 최적화 오류:`, error);
            showStatusMessage((chrome.i18n.getMessage('imageOptimizeError') || 'Error optimizing image: ') + error.message, 'error');
        });
}

// 마우스 커서 이미지를 적절한 크기로 최적화하는 함수
function optimizeMouseCursorImage(file, storageKey) {
    return new Promise((resolve, reject) => {
        try {
            // 최대 파일 크기 확인
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > 10) {
                const errorMsg = chrome.i18n.getMessage('imageFileTooLarge', [fileSizeMB.toFixed(1)]) || `Image size is too large (${fileSizeMB.toFixed(1)}MB). Please use an image smaller than 10MB.`;
                reject(new Error(errorMsg));
                return;
            }
            
            // 현재 커서 크기 설정 가져오기
            chrome.storage.sync.get(['mouseCursorSize'], (result) => {
                const cursorSizeSetting = result.mouseCursorSize || 'normal';
                let targetSize = 32; // 기본값 (normal)
                
                // 설정에 따라 목표 크기 결정
                switch (cursorSizeSetting) {
                    case 'large':
                        targetSize = 48; // 대형
                        break;
                    case 'xlarge':
                        targetSize = 64; // 특대형
                        break;
                    default:
                        targetSize = 32; // 보통 (기본값)
                }
                
                console.log(`마우스 커서 이미지 최적화 - 설정: ${cursorSizeSetting}, 목표 크기: ${targetSize}px`);
                
                // 파일을 Data URL로 읽기
                readFileAsDataURL(file)
                    .then(originalDataUrl => {
                        // 이미지 요소 생성
                        const img = new Image();
                        img.onload = () => {
                            try {
                                // 원본 크기 계산
                                const originalSize = Math.round(originalDataUrl.length / 1024);
                                console.log(`마우스 커서 원본 이미지: ${originalSize}KB, 해상도: ${img.width}x${img.height}`);
                                
                                // 이미지 유형 및 투명도 확인
                                const isPNG = originalDataUrl.indexOf('data:image/png') === 0;
                                const isTransparent = checkTransparency(img);
                                
                                console.log(`마우스 커서 이미지 타입: ${isPNG ? 'PNG' : '기타'}, 투명도: ${isTransparent ? '있음' : '없음'}`);
                                
                                // 비율 유지하며 크기 조정
                                const aspectRatio = img.width / img.height;
                                let finalWidth, finalHeight;
                                
                                if (img.width > img.height) {
                                    finalWidth = targetSize;
                                    finalHeight = Math.round(targetSize / aspectRatio);
                                } else {
                                    finalHeight = targetSize;
                                    finalWidth = Math.round(targetSize * aspectRatio);
                                }
                                
                                // 설정된 커서 크기에 맞게 조정
                                console.log(`마우스 커서 크기 조정: ${img.width}x${img.height} -> ${finalWidth}x${finalHeight}`);
                                
                                // 캔버스 생성
                                const canvas = document.createElement('canvas');
                                canvas.width = finalWidth;
                                canvas.height = finalHeight;
                                const ctx = canvas.getContext('2d', {alpha: true});
                                
                                // 투명 배경 명시적 설정
                                ctx.clearRect(0, 0, finalWidth, finalHeight);
                                
                                // 이미지 그리기
                                ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
                                
                                // 이미지 포맷 및 품질 결정 (PNG 고품질 유지)
                                let imageType = 'image/png';
                                let quality = 0.95; // 마우스 커서는 고품질 유지
                                
                                // 최적화된 데이터 URL 생성
                                let optimizedData = canvas.toDataURL(imageType, quality);
                                let optimizedSize = Math.round(optimizedData.length / 1024);
                                
                                console.log(`마우스 커서 최적화 완료: ${optimizedSize}KB, 해상도: ${finalWidth}x${finalHeight}`);
                                
                                // 메타데이터 설정 (커서 크기 정보 추가)
                                const metaData = {
                                    isCustomImage: true,
                                    storageKey: storageKey,
                                    removeBackground: false,
                                    timestamp: Date.now(),
                                    isPNG: true,
                                    hasTransparency: isTransparent,
                                    cursorSize: {
                                        setting: cursorSizeSetting,
                                        pixels: targetSize,
                                        width: finalWidth,
                                        height: finalHeight
                                    }
                                };
                                
                                console.log(`마우스 커서 메타데이터 설정:`, metaData);
                                
                                // 메타데이터 저장
                                chrome.storage.local.set({ [`${storageKey}_customMeta`]: metaData });
                                
                                // 커스텀 이미지 상태 업데이트
                                chrome.storage.sync.get(['customImageStatus'], (result) => {
                                    const customStatus = result.customImageStatus || {};
                                    
                                    // 해당 이미지 상태 업데이트
                                    customStatus[storageKey] = {
                                        timestamp: Date.now(),
                                        isCustom: true,
                                        cursorSize: cursorSizeSetting
                                    };
                                    
                                    // 상태 저장
                                    chrome.storage.sync.set({ customImageStatus: customStatus }, () => {
                                        console.log(`마우스 커서 이미지 상태 업데이트 완료`);
                                    });
                                });
                                
                                // 분할 저장 시작
                                splitAndStoreBase64(optimizedData, storageKey)
                                    .then(() => {
                                        resolve(optimizedData);
                                    })
                                    .catch(error => {
                                        console.error("마우스 커서 이미지 분할 저장 실패:", error);
                                        reject(error);
                                    });
                            } catch (canvasError) {
                                console.error("마우스 커서 이미지 처리 오류:", canvasError);
                                reject(canvasError);
                            }
                        };
                        
                        img.onerror = (error) => {
                            console.error("마우스 커서 이미지 로드 오류:", error);
                            const errorMsg = chrome.i18n.getMessage('imageLoadFailure') || 'Image load failure';
                        reject(new Error(errorMsg));
                        };
                        
                        img.src = originalDataUrl;
                    })
                    .catch(error => reject(error));
            });
        } catch (error) {
            reject(error);
        }
    });
}

// 이미지 최적화 및 자동 크기 조정 함수
function optimizeImage(file, storageKey) {
    // 마우스 커서 아이콘인 경우 전용 함수로 처리
    if (storageKey === 'mouseCursorIcon') {
        return optimizeMouseCursorImage(file, storageKey);
    }
    
    return new Promise((resolve, reject) => {
        try {
            // 최대 파일 크기 확인 - 10MB 이상이면 거부
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > 10) {
                const errorMsg = chrome.i18n.getMessage('imageFileTooLarge', [fileSizeMB.toFixed(1)]) || `Image size is too large (${fileSizeMB.toFixed(1)}MB). Please use an image smaller than 10MB.`;
                reject(new Error(errorMsg));
                return;
            }
            
            // 최대 크기 제한 (KB 단위) - 이미지 유형에 따라 다르게 설정
            let MAX_SIZE = 300; // 기본 최대 크기를 300KB로 증가
            
            // 마우스 커서는 200KB까지 허용
            if (storageKey === 'mouseCursorIcon') {
                MAX_SIZE = 200;
            }
            // 버튼 이미지는 더 큰 크기 허용 (크기 유지를 위해)
            else if (storageKey === 'backButtonIcon' || storageKey === 'addButtonIcon') {
                MAX_SIZE = 800; // 버튼 이미지 크기 제한 증가 (500KB → 800KB)
            }
            
            // 파일을 Data URL로 읽기
            readFileAsDataURL(file)
                .then(originalDataUrl => {
                    // 이미지 요소 생성
                    const img = new Image();
                    img.onload = () => {
                        try {
                            // 원본 크기 계산
                            const originalSize = Math.round(originalDataUrl.length / 1024);
                            console.log(`${storageKey} 원본 이미지 크기: ${originalSize}KB, 해상도: ${img.width}x${img.height}`);
                            
                            // 이미지 유형 및 투명도 확인
                            const isPNG = originalDataUrl.indexOf('data:image/png') === 0;
                            const isTransparent = checkTransparency(img);
                            
                            console.log(`${storageKey} 이미지 타입: ${isPNG ? 'PNG' : '기타'}, 투명도: ${isTransparent ? '있음' : '없음'}`);
                            
                            // 이미지가 이미 충분히 작은 경우 최적화하지 않고 반환
                            if (originalSize <= MAX_SIZE) {
                                console.log(`${storageKey}는 이미 충분히 작습니다. 최적화 없이 반환합니다.`);
                                
                                // 메타데이터 설정 - 항상 배경 제거 플래그 활성화
                                saveImageMetadata(storageKey, originalDataUrl, isPNG, isTransparent);
                                
                                resolve(originalDataUrl);
                                return;
                            }
                            
                            // 이미지 크기 조정 준비
                            const isVeryLargeImage = originalSize > 1024; // 1MB 이상
                            
                            // 이미지 종류에 따른 최적 크기 계산
                            let maxDimension;
                            
                            // 버튼 이미지는 크게 (최소 256px)
                            if (storageKey === 'backButtonIcon' || storageKey === 'addButtonIcon') {
                                maxDimension = Math.max(256, isVeryLargeImage ? img.width * 0.75 : img.width);
                                // 원본이 작은 경우 크기를 키우지 않음
                                if (img.width < 128 || img.height < 128) {
                                    maxDimension = Math.max(256, img.width * 2); // 작은 이미지는 2배로 확대
                                }
                            }
                            // 마우스 커서는 적절히
                            else if (storageKey === 'mouseCursorIcon') {
                                maxDimension = Math.min(128, img.width);
                            }
                            // 기타 이미지는 원래 크기 유지
                            else {
                                maxDimension = img.width;
                            }
                            
                            // 크기 조정 필요성 확인
                            const needsResize = (img.width > maxDimension * 1.5 || img.height > maxDimension * 1.5) || 
                                               originalSize > MAX_SIZE * 1.5;
                            
                            // 크기 조정 및 최적화
                            if (needsResize) {
                                // 비율 유지하며 크기 조정
                                const aspectRatio = img.width / img.height;
                                let targetWidth, targetHeight;
                                
                                if (img.width > img.height) {
                                    targetWidth = Math.min(maxDimension, img.width);
                                    targetHeight = Math.round(targetWidth / aspectRatio);
                                } else {
                                    targetHeight = Math.min(maxDimension, img.height);
                                    targetWidth = Math.round(targetHeight * aspectRatio);
                                }
                                
                                // 너무 작은 이미지는 확대
                                if (storageKey.includes('ButtonIcon') && (targetWidth < 128 || targetHeight < 128)) {
                                    // 버튼 이미지는 최소 128x128 이상
                                    const scale = 128 / Math.min(targetWidth, targetHeight);
                                    targetWidth = Math.round(targetWidth * scale);
                                    targetHeight = Math.round(targetHeight * scale);
                                }
                                
                                // 대용량 이미지는 강제로 더 작게 축소 - 더 적극적인 리사이징 적용
                                if (originalSize > 2000) {
                                    // 2MB 이상 이미지는 매우 작게 축소
                                    const reductionFactor = Math.min(0.4, 500 / originalSize);
                                    targetWidth = Math.round(targetWidth * reductionFactor);
                                    targetHeight = Math.round(targetHeight * reductionFactor);
                                    console.log(`대용량 이미지 강제 축소: ${reductionFactor.toFixed(2)}x (${targetWidth}x${targetHeight})`);
                                } else if (originalSize > 1000) {
                                    // 1MB-2MB 이미지는 중간 정도 축소
                                    const reductionFactor = Math.min(0.6, 600 / originalSize);
                                    targetWidth = Math.round(targetWidth * reductionFactor);
                                    targetHeight = Math.round(targetHeight * reductionFactor);
                                    console.log(`대용량 이미지 추가 축소: ${reductionFactor.toFixed(2)}x (${targetWidth}x${targetHeight})`);
                                }
                                
                                console.log(`이미지 크기 조정: ${img.width}x${img.height} -> ${targetWidth}x${targetHeight}`);
                                
                                // 캔버스 생성
                                const canvas = document.createElement('canvas');
                                canvas.width = targetWidth;
                                canvas.height = targetHeight;
                                const ctx = canvas.getContext('2d', {alpha: true});
                                
                                // 투명 배경 명시적 설정
                                ctx.clearRect(0, 0, targetWidth, targetHeight);
                                
                                // 이미지 그리기
                                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                                
                                // 이미지 포맷 및 품질 결정
                                let imageType, quality;
                                
                                // 투명도가 있거나 PNG인 경우 PNG 유지
                                if (isTransparent || isPNG) {
                                    imageType = 'image/png';
                                    
                                    // 이미지 크기에 따라 품질 조정
                                    if (originalSize > 1500) {
                                        quality = 0.7; // 대용량 PNG는 품질 낮춤
                                    } else if (originalSize > 800) {
                                        quality = 0.8; // 중간 크기 PNG
                                    } else {
                                        quality = 0.9; // 작은 PNG는 품질 유지
                                    }
                                } else {
                                    imageType = 'image/jpeg';
                                    quality = 0.85; // JPEG 이미지 품질
                                }
                                
                                // 최적화된 데이터 URL 생성
                                let optimizedData = canvas.toDataURL(imageType, quality);
                                let optimizedSize = Math.round(optimizedData.length / 1024);
                                
                                // 크기가 여전히 크면 추가 최적화 시도
                                if (optimizedSize > MAX_SIZE * 1.2 && (isTransparent || isPNG)) {
                                    // 더 작은 크기로 다시 시도
                                    const reductionFactor = Math.min(0.7, MAX_SIZE / optimizedSize);
                                    const newWidth = Math.round(targetWidth * reductionFactor);
                                    const newHeight = Math.round(targetHeight * reductionFactor);
                                    
                                    console.log(`PNG 품질 추가 최적화 - 크기: ${optimizedSize}KB → 목표: ${MAX_SIZE}KB`);
                                    console.log(`해상도 추가 축소: ${targetWidth}x${targetHeight} → ${newWidth}x${newHeight}`);
                                    
                                    // 새 캔버스 생성
                                    const canvas2 = document.createElement('canvas');
                                    canvas2.width = newWidth;
                                    canvas2.height = newHeight;
                                    const ctx2 = canvas2.getContext('2d', {alpha: true});
                                    
                                    // 투명 배경 설정
                                    ctx2.clearRect(0, 0, newWidth, newHeight);
                                    
                                    // 이미 리사이즈된 이미지를 다시 그림
                                    const tempImg = new Image();
                                    tempImg.src = optimizedData;
                                    
                                    // 이미지 로드 후 처리
                                    tempImg.onload = () => {
                                        ctx2.drawImage(tempImg, 0, 0, newWidth, newHeight);
                                        // 품질 더 낮춤
                                        const finalData = canvas2.toDataURL(imageType, 0.6);
                                        const finalSize = Math.round(finalData.length / 1024);
                                        console.log(`최종 이미지 크기: ${finalSize}KB (품질: 0.6)`);
                                        
                                        // 메타데이터 설정 및 결과 반환
                                        saveImageMetadata(storageKey, finalData, imageType === 'image/png', isTransparent);
                                        resolve(finalData);
                                    };
                                    
                                    // 오류 처리
                                    tempImg.onerror = () => {
                                        console.error("이미지 추가 최적화 실패");
                                        // 실패 시 원래 최적화된 데이터 사용
                                        saveImageMetadata(storageKey, optimizedData, imageType === 'image/png', isTransparent);
                                        resolve(optimizedData);
                                    };
                                    
                                    // 여기서 함수 종료 (resolve는 onload에서 호출됨)
                                    return;
                                }
                                
                                console.log(`${storageKey} 최적화 완료: ${optimizedSize}KB (원본: ${originalSize}KB), 압축률: ${Math.round((1 - optimizedSize/originalSize) * 100)}%`);
                                
                                // 메타데이터 설정 (항상 배경 제거 플래그 활성화)
                                saveImageMetadata(storageKey, optimizedData, imageType === 'image/png', isTransparent);
                                
                                resolve(optimizedData);
                            } else {
                                // 크기 조정이 필요 없는 경우 원본 그대로 사용
                                console.log(`${storageKey} 크기 조정 필요 없음. 원본 유지`);
                                
                                // 메타데이터 설정 (항상 배경 제거 플래그 활성화)
                                saveImageMetadata(storageKey, originalDataUrl, isPNG, isTransparent);
                                
                                resolve(originalDataUrl);
                            }
                        } catch (canvasError) {
                            console.error("캔버스 처리 오류:", canvasError);
                            // 오류 발생 시 원본 이미지 반환
                            saveImageMetadata(storageKey, originalDataUrl, originalDataUrl.indexOf('data:image/png') === 0, false);
                            resolve(originalDataUrl);
                        }
                    };
                    
                    img.onerror = (error) => {
                        console.error("이미지 로드 오류:", error);
                        const errorMsg = chrome.i18n.getMessage('imageLoadFailure') || 'Image load failure';
                        reject(new Error(errorMsg));
                    };
                    
                    img.src = originalDataUrl;
                })
                .catch(error => reject(error));
        } catch (error) {
            reject(error);
        }
    });
}

// 이미지 투명도 확인 함수
function checkTransparency(img) {
    try {
        // 임시 캔버스 생성
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.min(img.width, 100); // 작은 크기로 검사 (성능 향상)
        tempCanvas.height = Math.min(img.height, 100);
        const ctx = tempCanvas.getContext('2d', {alpha: true});
        
        // 이미지 그리기
        ctx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // 픽셀 데이터 가져오기
        const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const pixelData = imageData.data;
        
        // 투명 픽셀 확인 (알파 채널이 255 미만)
        for (let i = 3; i < pixelData.length; i += 4) {
            if (pixelData[i] < 250) { // 약간의 허용 오차
                return true; // 투명도 있음
            }
        }
        
        return false; // 투명도 없음
    } catch (e) {
        console.error("투명도 확인 오류:", e);
        return false; // 오류 시 기본값
    }
}

// 이미지 크기 계산 함수
function calculateNewDimensions(img, maxDimension, originalSize, maxSize, isVeryLarge) {
    const aspectRatio = img.width / img.height;
    let targetWidth, targetHeight;
    
    // 가로/세로 비율에 따라 크기 계산
    if (img.width > img.height) {
        targetWidth = Math.min(maxDimension, img.width);
        targetHeight = Math.round(targetWidth / aspectRatio);
    } else {
        targetHeight = Math.min(maxDimension, img.height);
        targetWidth = Math.round(targetHeight * aspectRatio);
    }
    
    // 매우 큰 이미지는 더 작게 조정
    if (isVeryLarge) {
        const scaleFactor = Math.min(0.5, maxSize / originalSize);
        targetWidth = Math.max(48, Math.round(targetWidth * scaleFactor));
        targetHeight = Math.max(48, Math.round(targetHeight * scaleFactor));
    } else if (originalSize > maxSize * 5) {
        const scaleFactor = Math.min(0.6, maxSize / originalSize);
        targetWidth = Math.round(targetWidth * scaleFactor);
        targetHeight = Math.round(targetHeight * scaleFactor);
    }
    
    return { targetWidth, targetHeight };
}

// 이미지 리사이즈 및 최적화 함수
function resizeAndOptimizeImage(img, width, height, isPNG, isTransparent) {
    // 캔버스 생성
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {alpha: true});
    
    // 캔버스 초기화 (투명 배경)
    ctx.clearRect(0, 0, width, height);
    
    // 이미지 그리기
    ctx.drawImage(img, 0, 0, width, height);
    
    // 이미지 포맷 및 품질 결정
    let imageType, quality;
    
    // 투명도가 있거나 원본이 PNG인 경우 PNG 유지
    if (isTransparent || isPNG) {
        imageType = 'image/png';
        quality = 0.9;
    } else {
        // 그 외는 JPEG 변환 (크기 최적화)
        imageType = 'image/jpeg';
        quality = 0.8;
    }
    
    // 최적화된 데이터 URL 생성
    const dataUrl = canvas.toDataURL(imageType, quality);
    
    // 결과 크기 계산
    const size = Math.round(dataUrl.length / 1024);
    
    return { dataUrl, size, imageType };
}

// 이미지 메타데이터 저장 함수
function saveImageMetadata(storageKey, dataUrl, isPNG, isTransparent) {
    // 버튼 이미지인 경우 항상 배경 제거 플래그 활성화
    const removeBackground = (storageKey === 'backButtonIcon' || storageKey === 'addButtonIcon');
    
    // 메타데이터 생성
    const metaData = {
        isCustomImage: true,
        storageKey: storageKey,
        removeBackground: removeBackground, // 버튼 이미지는 항상 true
        timestamp: Date.now(),
        isPNG: isPNG,
        hasTransparency: isTransparent
    };
    
    console.log(`${storageKey} 메타데이터 설정:`, metaData);
    
    // 메타데이터 저장
    chrome.storage.local.set({ [`${storageKey}_customMeta`]: metaData });
    
    // 커스텀 이미지 상태 업데이트 (동기화 저장소에서 관리)
    chrome.storage.sync.get(['customImageStatus'], (result) => {
        const customStatus = result.customImageStatus || {};
        
        // 해당 이미지 상태 업데이트
        customStatus[storageKey] = {
            timestamp: Date.now(),
            isCustom: true,
            removeBackground: removeBackground // 버튼 이미지는 항상 배경 제거
        };
        
        // 상태 저장
        chrome.storage.sync.set({ customImageStatus: customStatus }, () => {
            console.log(`${storageKey} 커스텀 이미지 상태 업데이트 완료`);
        });
    });
}

// base64 데이터를 작은 조각으로 나누어 저장하는 함수
function splitAndStoreBase64(dataUrl, keyPrefix) {
    return new Promise((resolve, reject) => {
        try {
            // 기존 조각 모두 삭제
            const keysToRemove = [];
            for (let i = 0; i < 50; i++) { // 최대 조각 수 증가 (20→50개)
                keysToRemove.push(`${keyPrefix}_part${i}`);
            }
            
            chrome.storage.local.remove(keysToRemove, () => {
                if (chrome.runtime.lastError) {
                    console.warn("기존 데이터 삭제 중 오류:", chrome.runtime.lastError);
                }
                
                // 데이터를 청크로 분할 (크기 증가: 10KB → 30KB)
                const chunkSize = 30 * 1024; // 30KB
                const totalParts = Math.ceil(dataUrl.length / chunkSize);
                
                if (totalParts > 50) { // 최대 조각 수 증가 (20→50)
                    const errorMsg = chrome.i18n.getMessage('imageTooLargeForStorage') || 'Image is too large. Please use a smaller image.';
                reject(new Error(errorMsg));
                    return;
                }
                
                // 메타데이터 저장
                const metaData = {
                    totalParts: totalParts,
                    totalSize: dataUrl.length,
                    timestamp: Date.now(),
                    isPNG: dataUrl.indexOf('data:image/png') === 0 // PNG 여부 저장
                };
                
                chrome.storage.local.set({ [`${keyPrefix}_meta`]: metaData }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    
                    // 각 부분을 저장
                    let partsSaved = 0;
                    
                    for (let i = 0; i < totalParts; i++) {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize, dataUrl.length);
                        const part = dataUrl.substring(start, end);
                        
                        chrome.storage.local.set({ [`${keyPrefix}_part${i}`]: part }, () => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                                return;
                            }
                            
                            partsSaved++;
                            if (partsSaved === totalParts) {
                                resolve();
                            }
                        });
                    }
                });
            });
        } catch (error) {
            reject(error);
        }
    });
}

// 분할 저장된 base64 데이터를 복원하는 함수
function loadSplitBase64Data(keyPrefix) {
    return new Promise((resolve, reject) => {
        if (!keyPrefix) {
            console.warn("키 접두사가 유효하지 않습니다:", keyPrefix);
            resolve(''); // 빈 문자열 반환
            return;
        }
        
        try {
            chrome.storage.local.get(`${keyPrefix}_meta`, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn(`${keyPrefix} 메타데이터 로드 실패:`, chrome.runtime.lastError);
                    resolve(''); // 오류 시 빈 문자열 반환
                    return;
                }
                
                const metaData = result[`${keyPrefix}_meta`];
                if (!metaData) {
                    console.log(`${keyPrefix}에 대한 메타데이터가 없습니다.`);
                    resolve(''); // 메타데이터가 없으면 빈 문자열 반환
                    return;
                }
                
                // 필요한 모든 부분의 키 생성 (최대 20개로 증가)
                const partKeys = [];
                for (let i = 0; i < metaData.totalParts; i++) {
                    partKeys.push(`${keyPrefix}_part${i}`);
                }
                
                // 모든 부분 로드
                chrome.storage.local.get(partKeys, (parts) => {
                    if (chrome.runtime.lastError) {
                        console.warn(`${keyPrefix} 부분 데이터 로드 실패:`, chrome.runtime.lastError);
                        resolve(''); // 오류 시 빈 문자열 반환
                        return;
                    }
                    
                    try {
                        // 부분 결합
                        let fullData = '';
                        let missingPart = false;
                        
                        for (let i = 0; i < metaData.totalParts; i++) {
                            const part = parts[`${keyPrefix}_part${i}`];
                            if (part) {
                                fullData += part;
                            } else {
                                console.warn(`${keyPrefix}의 ${i}번째 부분이 누락되었습니다.`);
                                missingPart = true;
                                break;
                            }
                        }
                        
                        if (missingPart) {
                            resolve(''); // 누락된 부분이 있으면 빈 문자열 반환
                        } else {
                            resolve(fullData);
                        }
                    } catch (processingError) {
                        console.error(`${keyPrefix} 데이터 처리 중 오류:`, processingError);
                        resolve(''); // 처리 오류 시 빈 문자열 반환
                    }
                });
            });
        } catch (error) {
            console.error(`${keyPrefix} 로드 중 예외 발생:`, error);
            resolve(''); // 예외 발생 시 빈 문자열 반환
        }
    });
}

// 이미지 미리보기 업데이트
function updateImagePreviews() {
    const previewMap = [
        { key: 'backButtonIcon', previewId: 'backButtonPreview', noPreviewId: 'backButtonNoPreview' },
        { key: 'addButtonIcon', previewId: 'addButtonPreview', noPreviewId: 'addButtonNoPreview' },
        { key: 'mouseCursorIcon', previewId: 'mouseCursorPreview', noPreviewId: 'mouseCursorNoPreview' }
    ];
    
    previewMap.forEach(item => {
        loadSplitBase64Data(item.key)
            .then(dataUrl => {
                if (dataUrl) {
                    const previewElement = document.getElementById(item.previewId);
                    const noPreviewElement = document.getElementById(item.noPreviewId);
                    
                    if (previewElement) {
                        previewElement.src = dataUrl;
                        previewElement.classList.remove('hidden');
                        
                        // noPreviewElement가 있는 경우에만 처리
                        if (noPreviewElement) {
                            noPreviewElement.classList.add('hidden');
                        }
                    }
                }
            })
            .catch(error => {
                console.warn(`${item.key} 로드 오류:`, error);
            });
    });
}

// 상태 메시지 표시 함수
function showStatusMessage(message, type = 'info') {
    const status = document.getElementById('status');
    if (!status) return;
    
    status.textContent = message;
    
    // 메시지 유형에 따른 스타일 변경
    status.className = 'inline-block ml-4 font-medium';
    
    switch (type) {
        case 'error':
            status.classList.add('text-red-500');
            break;
        case 'success':
            status.classList.add('text-green-400');
            break;
        case 'warning':
            status.classList.add('text-yellow-500');
            break;
        case 'info':
        default:
            status.classList.add('text-blue-400');
            break;
    }
    
    // 3초 후 메시지 삭제
    setTimeout(() => {
        status.textContent = '';
    }, 3000);
}

// Show preview when a file is selected
function handleFilePreview(inputElement, previewElement) {
    if (!inputElement || !previewElement) {
        console.warn("미리보기 초기화 실패: 유효하지 않은 요소", {
            inputElement: !!inputElement,
            previewElement: !!previewElement
        });
        return;
    }
    
    inputElement.addEventListener('change', (event) => {
        const file = event.target.files ? event.target.files[0] : null;
        if (file) {
            readFileAsDataURL(file).then(dataUrl => {
                previewElement.src = dataUrl;
                previewElement.classList.remove('hidden');
            }).catch(error => {
                console.error("Error reading file for preview:", error);
                previewElement.classList.add('hidden');
            });
        } else {
             // If file selection is cancelled, potentially hide or reset preview
             // For now, keep the previous image or hide if it was empty
             if (!previewElement.src.startsWith('data:image')){
                 previewElement.classList.add('hidden');
             }
        }
    });
}

// 파일을 Base64 Data URL로 읽는 함수
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

// --- Import Logic ---

// Check if initial import was already done or skipped
function checkShowInitialImport() {
    // 북마크 불러오기 섹션은 처음에는 표시
    initialImportSection.classList.remove('hidden');
    
    // 북마크 폴더 목록 불러오기
    loadImportFolderList();
}

// 북마크 불러오기 버튼 이벤트 리스너
function setupImportButtonListener() {
    if (showImportButton) {
        showImportButton.addEventListener('click', () => {
            console.log("북마크 불러오기 버튼 클릭됨");
            // 북마크 섹션이 숨겨져 있다면 표시
            initialImportSection.classList.remove('hidden');
            
            // 폴더 목록 새로고침
            loadImportFolderList();
            
            // 섹션으로 스크롤
            setTimeout(() => {
                initialImportSection.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        });
    }
    
    // 전체 선택 버튼
    if (selectAllButton) {
        selectAllButton.addEventListener('click', () => {
            const checkboxes = importFolderListDiv.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
            });
            updateSelectedFoldersCount();
        });
    }
    
    // 전체 해제 버튼
    if (deselectAllButton) {
        deselectAllButton.addEventListener('click', () => {
            const checkboxes = importFolderListDiv.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            updateSelectedFoldersCount();
        });
    }
}

// 선택된 폴더 개수 업데이트
function updateSelectedFoldersCount() {
    const selectedCheckboxes = importFolderListDiv.querySelectorAll('input[type="checkbox"]:checked');
    const count = selectedCheckboxes.length;
    
    // 선택된 폴더 개수 표시 업데이트
    selectedFoldersCount.textContent = '';
    
    const labelSpan = document.createElement('span');
    labelSpan.setAttribute('data-i18n', 'selectedFoldersLabel');
    labelSpan.textContent = getLocalizedMessage('selectedFoldersLabel') || 'Selected folders:';
    
    const countSpan = document.createElement('span');
    countSpan.className = 'text-bookmark-blue dark:text-teal-300 font-medium';
    countSpan.textContent = ` ${count}`;
    
    const unitSpan = document.createElement('span');
    unitSpan.setAttribute('data-i18n', 'foldersUnit');
    unitSpan.textContent = getLocalizedMessage('foldersUnit') || '';
    
    selectedFoldersCount.appendChild(labelSpan);
    selectedFoldersCount.appendChild(countSpan);
    selectedFoldersCount.appendChild(unitSpan);
    
    // 선택된 폴더가 있는 경우 버튼 활성화
    startImportButton.disabled = count === 0;
    if (count === 0) {
        startImportButton.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        startImportButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    // 체크된 항목 강조 표시
    const allFolderItems = importFolderListDiv.querySelectorAll('.folder-item');
    allFolderItems.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox && checkbox.checked) {
            item.classList.add('bg-blue-50', 'dark:bg-blue-900/20', 'border-l-4', 'border-bookmark-blue', 'dark:border-teal-500');
        } else {
            item.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'border-l-4', 'border-bookmark-blue', 'dark:border-teal-500');
        }
    });
}

// 폴더 목록 불러오기 함수 - 디바운싱 및 레이스 컨디션 방지
let loadFoldersTimeout = null;
let isLoadingFolders = false;

function loadImportFolderList() {
    // 이미 로딩 중이면 무시
    if (isLoadingFolders) {
        console.log('[options.js] loadImportFolderList: Already loading, skipping');
        return;
    }
    
    // 기존 타임아웃이 있으면 클리어
    if (loadFoldersTimeout) {
        clearTimeout(loadFoldersTimeout);
    }
    
    // 250ms 디바운싱
    loadFoldersTimeout = setTimeout(() => {
        loadImportFolderListImpl();
    }, 250);
}

function loadImportFolderListImpl() {
    resetImportStatus();
    
    // Create loading element structure using DOM methods
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'py-6 text-center text-gray-400';
    
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('class', 'w-12 h-12 mx-auto mb-3');
    svgElement.setAttribute('fill', 'none');
    svgElement.setAttribute('stroke', 'currentColor');
    svgElement.setAttribute('viewBox', '0 0 24 24');
    
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('stroke-linecap', 'round');
    pathElement.setAttribute('stroke-linejoin', 'round');
    pathElement.setAttribute('stroke-width', '2');
    pathElement.setAttribute('d', 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z');
    
    svgElement.appendChild(pathElement);
    
    const textElement = document.createElement('p');
    textElement.className = 'text-lg';
    textElement.setAttribute('data-i18n', 'loadingFolders');
    textElement.textContent = chrome.i18n.getMessage('loadingFolders') || 'Loading bookmark folders...';
    
    loadingDiv.appendChild(svgElement);
    loadingDiv.appendChild(textElement);
    
    if (importFolderListDiv) {
        importFolderListDiv.textContent = '';
        importFolderListDiv.appendChild(loadingDiv);
    }
    if (selectedFoldersCount) {
        selectedFoldersCount.textContent = '';
        
        const labelSpan = document.createElement('span');
        labelSpan.setAttribute('data-i18n', 'selectedFoldersLabel');
        labelSpan.textContent = chrome.i18n.getMessage('selectedFoldersLabel') || 'Selected folders:';
        
        const countSpan = document.createElement('span');
        countSpan.className = 'text-blue-500';
        countSpan.textContent = ' 0';
        
        const unitSpan = document.createElement('span');
        unitSpan.setAttribute('data-i18n', 'foldersUnit');
        unitSpan.textContent = chrome.i18n.getMessage('foldersUnit') || '';
        
        selectedFoldersCount.appendChild(labelSpan);
        selectedFoldersCount.appendChild(countSpan);  
        selectedFoldersCount.appendChild(unitSpan);
    }
    if(startImportButton) startImportButton.disabled = true;
    if(selectAllButton) selectAllButton.disabled = true;
    if(deselectAllButton) deselectAllButton.disabled = true;

    isLoadingFolders = true;
    console.log("[options.js] getTopLevelFolders Starting folder load");
    const messageTimeout = setTimeout(() => {
        isLoadingFolders = false;
        console.error("[options.js] getTopLevelFolders Folder loading timeout (10s)");
        const timeoutMsg = chrome.i18n.getMessage("errorLoadingFoldersTimeout") || 'Folder loading timed out. Please restart the extension or browser.';
        if (importFolderListDiv) {
            importFolderListDiv.textContent = '';
            const errorParagraph = document.createElement('p');
            errorParagraph.className = 'py-3 text-center text-red-500 dark:text-red-400';
            errorParagraph.textContent = timeoutMsg;
            importFolderListDiv.appendChild(errorParagraph);
        }
        showImportStatus(timeoutMsg, 'error');
    }, 10000); // 타임아웃 시간을 10초로 늘림

    try {
        chrome.runtime.sendMessage({ action: "getTopLevelFolders" }, (response) => {
            clearTimeout(messageTimeout);
            isLoadingFolders = false;
            console.log("[options.js] getTopLevelFolders Response received:", response);

            if (chrome.runtime.lastError) {
                console.error("[options.js] Folder loading error (sendMessage callback):", chrome.runtime.lastError);
                const errorMsg = chrome.i18n.getMessage("errorLoadingFolders", [chrome.runtime.lastError.message]) || `Bookmark folder loading error: ${chrome.runtime.lastError.message}`;
                if (importFolderListDiv) {
                    importFolderListDiv.textContent = '';
                    const errorParagraph = document.createElement('p');
                    errorParagraph.className = 'py-3 text-center text-red-500 dark:text-red-400';
                    errorParagraph.textContent = errorMsg;
                    importFolderListDiv.appendChild(errorParagraph);
                }
                showImportStatus(errorMsg, 'error');
                return;
            }

            if (response && response.success && response.folders) {
                console.log("[options.js] populateImportFolderList Starting, received folders:", response.folders.length);
                populateImportFolderList(response.folders);
                updateSelectedFoldersCount(); 
                console.log("[options.js] populateImportFolderList Completed.");
                // 로딩 UI가 아닌 다른 내용이 표시되므로, hideImportStatus는 populateImportFolderList 내부 또는 직후에 필요시 호출
                // 여기서는 populateImportFolderList가 내용을 채우므로 별도 hide 불필요
            } else {
                console.error("[options.js] Folder loading failed or no folders. Response:", response);
                const noFoldersMsg = getLocalizedMessage("errorNoFoldersToImport") || chrome.i18n.getMessage("errorNoFoldersToImport") || 'No bookmark folders to import or loading failed.';
                if (importFolderListDiv) {
                    importFolderListDiv.textContent = '';
                    const errorParagraph = document.createElement('p');
                    errorParagraph.className = 'py-3 text-center text-red-500 dark:text-red-400';
                    errorParagraph.textContent = noFoldersMsg;
                    importFolderListDiv.appendChild(errorParagraph);
                }
                showImportStatus(noFoldersMsg, 'error');
            }
        });
    } catch (error) {
        clearTimeout(messageTimeout);
        isLoadingFolders = false;
        console.error("[options.js] loadImportFolderList Direct error:", error);
        const exceptionMsg = chrome.i18n.getMessage("errorLoadingFoldersException", [error.message]) || `Exception during folder loading: ${error.message}`;
        if (importFolderListDiv) {
            importFolderListDiv.textContent = '';
            const errorParagraph = document.createElement('p');
            errorParagraph.className = 'py-3 text-center text-red-500 dark:text-red-400';
            errorParagraph.textContent = exceptionMsg;
            importFolderListDiv.appendChild(errorParagraph);
        }
        showImportStatus(exceptionMsg, 'error');
    }
}

// Populate the list of folders to import from
function populateImportFolderList(folders) {
    console.log("[options.js] populateImportFolderList starting, folder count:", folders ? folders.length : 0);
    importFolderListDiv.textContent = ''; 
    if (!folders || folders.length === 0) {
        const noFolderKey = "noFoldersToImportMsg"; // Using message key
        const noFolderMessage = document.createElement('p');
        noFolderMessage.textContent = chrome.i18n.getMessage(noFolderKey) || 'No bookmark folders to import.';
        noFolderMessage.className = 'py-3 text-center text-gray-600 dark:text-gray-400';
        importFolderListDiv.appendChild(noFolderMessage);
        if (selectedFoldersCount) {
            selectedFoldersCount.textContent = '';
            
            const labelSpan = document.createElement('span');
            labelSpan.setAttribute('data-i18n', 'selectedFoldersLabel');
            labelSpan.textContent = chrome.i18n.getMessage('selectedFoldersLabel') || 'Selected folders:';
            
            const countSpan = document.createElement('span');
            countSpan.className = 'text-blue-500';
            countSpan.textContent = ' 0';
            
            const unitSpan = document.createElement('span');
            unitSpan.setAttribute('data-i18n', 'foldersUnit');
            unitSpan.textContent = chrome.i18n.getMessage('foldersUnit') || '';
            
            selectedFoldersCount.appendChild(labelSpan);
            selectedFoldersCount.appendChild(countSpan);
            selectedFoldersCount.appendChild(unitSpan);
        }
        // Disable buttons when no folders available
        if(startImportButton) startImportButton.disabled = true;
        if(selectAllButton) selectAllButton.disabled = true;
        if(deselectAllButton) deselectAllButton.disabled = true;
        return;
    }

    // Enable buttons when folders are available (initial state)
    if(startImportButton) startImportButton.disabled = true; // Initially disabled - no folders selected
    if(selectAllButton) selectAllButton.disabled = false;
    if(deselectAllButton) deselectAllButton.disabled = false;

    const headerElement = document.createElement('div');
    headerElement.className = 'mb-3 pb-2 border-b border-gray-200 dark:border-gray-700';
    
    const descriptionParagraph = document.createElement('p');
    descriptionParagraph.className = 'text-sm text-gray-600 dark:text-gray-400';
    descriptionParagraph.setAttribute('data-i18n', 'importBookmarksDesc');
    descriptionParagraph.textContent = getLocalizedMessage('importBookmarksDesc') || 'Import bookmarks from the folders below. Selecting a folder will import all bookmarks from that folder into BookStaxx.';
    
    headerElement.appendChild(descriptionParagraph);
    importFolderListDiv.appendChild(headerElement);

    let folderCount = 0;
    folders.forEach(folder => {
        if (folder.title === 'BookStaxx') return;
        folderCount++;
        const item = document.createElement('div');
        item.className = 'folder-item mb-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-750 rounded-md transition-all duration-200';
        item.dataset.folderId = folder.id; // 데이터 속성 추가
        
        const indentLevel = folder.level || 0;
        const label = document.createElement('label');
        label.className = 'flex items-center space-x-3 cursor-pointer';
        if (indentLevel > 0) {
            const indentElement = document.createElement('div');
            indentElement.className = 'flex-shrink-0';
            indentElement.style.width = `${indentLevel * 16}px`;
            label.appendChild(indentElement);
        }
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = folder.id; // folder.id가 정확히 설정되는지 확인
        checkbox.id = `folder-${folder.id}`;
        checkbox.className = 'form-checkbox h-5 w-5 text-bookmark-blue rounded transition-all';
        checkbox.addEventListener('change', updateSelectedFoldersCount);
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'text-gray-500 dark:text-gray-400 flex-shrink-0';
        
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.setAttribute('class', 'w-5 h-5');
        svgElement.setAttribute('fill', 'none');
        svgElement.setAttribute('stroke', 'currentColor');
        svgElement.setAttribute('viewBox', '0 0 24 24');
        
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('stroke-linecap', 'round');
        pathElement.setAttribute('stroke-linejoin', 'round');
        pathElement.setAttribute('stroke-width', '2');
        
        if (folder.id === '1') {
            pathElement.setAttribute('d', 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z');
        } else if (folder.id === '2') {
            pathElement.setAttribute('d', 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2');
        } else {
            pathElement.setAttribute('d', 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z');
        }
        
        svgElement.appendChild(pathElement);
        iconSpan.appendChild(svgElement);
        const textContainer = document.createElement('div');
        textContainer.className = 'flex flex-col flex-grow overflow-hidden';
        const textSpan = document.createElement('span');
        textSpan.textContent = folder.title || (folder.id === '1' ? (chrome.i18n.getMessage('bookmarksBarLabel') || 'Bookmarks Bar') : (chrome.i18n.getMessage('otherBookmarksLabel') || 'Other Bookmarks'));
        textSpan.className = 'text-sm text-gray-700 dark:text-gray-300 truncate';
        textContainer.appendChild(textSpan);
        // ... (pathSpan 로직은 background.js에서 path 정보를 보내지 않으므로 일단 주석 처리 또는 제거)
        label.appendChild(checkbox); label.appendChild(iconSpan); label.appendChild(textContainer);
        item.appendChild(label);
        importFolderListDiv.appendChild(item);
    });
    if (folderCount === 0 && importFolderListDiv.childElementCount <= 1) { // 헤더만 있을 경우
        const noOtherFoldersKey = "noOtherFoldersMsg";
        const noFolderMessage = document.createElement('p');
        noFolderMessage.textContent = chrome.i18n.getMessage(noOtherFoldersKey) || 'No bookmark folders to import except BookStaxx folder.';
        noFolderMessage.className = 'py-3 text-center text-gray-600 dark:text-gray-400';
        importFolderListDiv.appendChild(noFolderMessage);
    }
    if (selectedFoldersCount) {
        selectedFoldersCount.textContent = '';
        
        const labelSpan = document.createElement('span');
        labelSpan.setAttribute('data-i18n', 'selectedFoldersLabel');
        labelSpan.textContent = chrome.i18n.getMessage('selectedFoldersLabel') || 'Selected folders:';
        
        const countSpan = document.createElement('span');
        countSpan.className = 'text-blue-500';
        countSpan.textContent = ' 0';
        
        const unitSpan = document.createElement('span');
        unitSpan.setAttribute('data-i18n', 'foldersUnit');
        unitSpan.textContent = chrome.i18n.getMessage('foldersUnit') || '';
        
        selectedFoldersCount.appendChild(labelSpan);
        selectedFoldersCount.appendChild(countSpan);
        selectedFoldersCount.appendChild(unitSpan);
    }
}

// 가져오기 상태 표시 함수 
function showImportStatus(message, type = 'info') {
    importStatusDiv.textContent = message;
    importStatusDiv.classList.remove('hidden', 'bg-yellow-100', 'text-yellow-800', 'bg-red-100', 'text-red-800', 'bg-green-100', 'text-green-800');
    
    switch (type) {
        case 'error':
            importStatusDiv.classList.add('bg-red-100', 'text-red-800');
            break;
        case 'success':
            importStatusDiv.classList.add('bg-green-100', 'text-green-800');
            break;
        case 'warning':
        case 'info':
        default:
            importStatusDiv.classList.add('bg-yellow-100', 'text-yellow-800');
            break;
    }
}

// 가져오기 상태 숨기기
function hideImportStatus() {
    importStatusDiv.classList.add('hidden');
}

// 가져오기 상태 초기화
function resetImportStatus() {
    importStatusDiv.textContent = '';
    importStatusDiv.classList.add('hidden');
}

// Handle starting the import
function handleStartImport() {
    const selectedCheckboxes = importFolderListDiv.querySelectorAll('input[type="checkbox"]:checked');
    const folderIdsToImport = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (folderIdsToImport.length === 0) {
        showImportStatus(chrome.i18n.getMessage('selectFoldersToImport') || 'Please select at least one folder to import.', 'error');
        return;
    }

    showImportStatus(getLocalizedMessage('importingBookmarks') || 'Importing bookmarks... Please wait.', 'info');
    
    // 버튼 비활성화 및 로딩 상태 표시
    startImportButton.disabled = true;
    skipImportButton.disabled = true;
    startImportButton.classList.add('opacity-50', 'cursor-not-allowed');
    skipImportButton.classList.add('opacity-50', 'cursor-not-allowed');
    
    // 로딩 아이콘 추가
    const originalButtonContent = startImportButton.cloneNode(true);
    startImportButton.textContent = '';
    
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('class', 'animate-spin -ml-1 mr-2 h-4 w-4 text-white');
    svgElement.setAttribute('fill', 'none');
    svgElement.setAttribute('viewBox', '0 0 24 24');
    
    const circleElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleElement.setAttribute('class', 'opacity-25');
    circleElement.setAttribute('cx', '12');
    circleElement.setAttribute('cy', '12');
    circleElement.setAttribute('r', '10');
    circleElement.setAttribute('stroke', 'currentColor');
    circleElement.setAttribute('stroke-width', '4');
    
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('class', 'opacity-75');
    pathElement.setAttribute('fill', 'currentColor');
    pathElement.setAttribute('d', 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z');
    
    svgElement.appendChild(circleElement);
    svgElement.appendChild(pathElement);
    
    const textNode = document.createTextNode(getLocalizedMessage('importing') || 'Importing...');
    
    startImportButton.appendChild(svgElement);
    startImportButton.appendChild(textNode);

    chrome.runtime.sendMessage({ action: "importInitialBookmarks", sourceFolderIds: folderIdsToImport },
        (response) => {
            // 버튼 상태 복원
            startImportButton.disabled = false;
            skipImportButton.disabled = false;
            startImportButton.classList.remove('opacity-50', 'cursor-not-allowed');
            skipImportButton.classList.remove('opacity-50', 'cursor-not-allowed');
            startImportButton.textContent = '';
            startImportButton.className = originalButtonContent.className;
            while (originalButtonContent.firstChild) {
                startImportButton.appendChild(originalButtonContent.firstChild);
            }
            
            if (chrome.runtime.lastError) {
                console.error("북마크 가져오기 오류:", chrome.runtime.lastError);
                showImportStatus((chrome.i18n.getMessage('bookmarkImportError') || 'Bookmark import error: ') + chrome.runtime.lastError.message, 'error');
                return;
            }
            
            if (response && response.success) {
                // 성공 메시지 표시
                showImportStatus((getLocalizedMessage('importStatusSuccess') || 'Successfully imported {count} bookmarks.').replace('{count}', response.count), 'success');
                
                // 체크박스 모두 해제
                const checkboxes = importFolderListDiv.querySelectorAll('input[type="checkbox"]:checked');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                updateSelectedFoldersCount();
            } else {
                showImportStatus((chrome.i18n.getMessage('bookmarkImportFailed') || 'Bookmark import failed: ') + (response?.error || chrome.i18n.getMessage('unknownError') || 'Unknown error'), 'error');
            }
        });
}

// Handle skipping the import
function handleCloseImportSection() {
    // 북마크 불러오기 섹션 숨기기
    initialImportSection.classList.add('hidden');
    
    // 상태 초기화
    resetImportStatus();
    
    // 버튼 상태 초기화
    startImportButton.disabled = false;
    skipImportButton.disabled = false;
    startImportButton.classList.remove('opacity-50', 'cursor-not-allowed');
    skipImportButton.classList.remove('opacity-50', 'cursor-not-allowed');
    
    console.log("Import section closed by user.");
    
    // 북마크 표시 설정 섹션으로 스크롤
    document.querySelector('.section-card:not(#initial-import-section)').scrollIntoView({ behavior: 'smooth' });
}

// 개별 이미지 재설정 함수
function resetImage(imageKey, previewId, noPreviewId, showConfirm = true) {
    if (showConfirm && !confirm(getLocalizedMessage('confirmResetImage', [imageKey]))) {
        return;
    }
    
    // 삭제할 키 생성
    const keysToRemove = [];
    keysToRemove.push(`${imageKey}_meta`);
    keysToRemove.push(`${imageKey}_customMeta`);
    for (let i = 0; i < 20; i++) {
        keysToRemove.push(`${imageKey}_part${i}`);
    }
    
    // 이미지 데이터 삭제
    chrome.storage.local.remove(keysToRemove, () => {
        if (chrome.runtime.lastError) {
            console.error(`${imageKey} 초기화 오류:`, chrome.runtime.lastError);
            showStatusMessage(getLocalizedMessage('imageResetError', [imageKey]), 'error');
            return;
        }
        
        // 미리보기 초기화
        const previewElement = document.getElementById(previewId);
        const noPreviewElement = document.getElementById(noPreviewId);
        
        if (previewElement) {
            previewElement.src = '';
            previewElement.classList.add('hidden');
        }
        
        if (noPreviewElement) {
            noPreviewElement.classList.remove('hidden');
        }
        
        // 커스텀 이미지 상태 업데이트
        updateCustomImageStatus();
        
        // 성공 메시지 표시
        showStatusMessage(getLocalizedMessage('imageResetSuccess', [imageKey]), 'success');
    });
}

// 모든 설정 초기화 함수
function resetAllSettings() {
    if (!confirm(getLocalizedMessage('confirmResetSettings'))) {
        return;
    }
    try {
        showStatusMessage(getLocalizedMessage('resettingSettings'), 'loading');
        chrome.storage.sync.set(DEFAULT_SETTINGS, function() {
            if (chrome.runtime.lastError) {
                console.error("설정 초기화 중 오류:", chrome.runtime.lastError);
                showStatusMessage(getLocalizedMessage('errorResettingSettings'), 'error');
                return;
            }
            resetUIToDefaults(); // UI 요소들도 기본값으로 (이 함수는 selectedLanguage도 처리해야 함)
            applyLanguage(DEFAULT_SETTINGS.selectedLanguage).catch(error => console.error('Error applying language:', error));
            showStatusMessage(getLocalizedMessage('settingsResetSuccess'), 'success');
        });

        const imageKeysToReset = ['backButtonIcon', 'addButtonIcon', 'mouseCursorIcon'];
        imageKeysToReset.forEach(key => {
            const previewId = `${key.replace('Icon', '')}Preview`;
            const noPreviewId = `${previewId}NoPreview`;
            resetImage(key, previewId, noPreviewId, false); // confirm 없이 내부에서 바로 리셋
        });
    }
     catch (error) {
        console.error("설정 초기화 중 예외 발생:", error);
        showStatusMessage(getLocalizedMessage('errorResettingSettings'), 'error');
    }
}

// UI 요소들을 기본값으로 설정하는 함수
function resetUIToDefaults() {
    // ... (기존 UI 요소 초기화)
    if(bookmarkIconSizeSelect) bookmarkIconSizeSelect.value = DEFAULT_SETTINGS.bookmarkIconSize;
    if(bookmarkFontSizeSelect) bookmarkFontSizeSelect.value = DEFAULT_SETTINGS.bookmarkFontSize;
    if(showBookmarkTitlesCheckbox) showBookmarkTitlesCheckbox.checked = DEFAULT_SETTINGS.showBookmarkTitles;
    if(maxBookmarksInput) maxBookmarksInput.value = DEFAULT_SETTINGS.maxBookmarks;
    if(document.getElementById('maxBookmarksValue')) document.getElementById('maxBookmarksValue').textContent = DEFAULT_SETTINGS.maxBookmarks;
    if(animationEnabledCheckbox) animationEnabledCheckbox.checked = DEFAULT_SETTINGS.animationEnabled;
    if(bookmarkLayoutModeSelect) bookmarkLayoutModeSelect.value = DEFAULT_SETTINGS.bookmarkLayoutMode;
    if(bookmarkAnimationModeSelect) bookmarkAnimationModeSelect.value = DEFAULT_SETTINGS.bookmarkAnimationMode;
    if(bookmarkSortOrderSelect) bookmarkSortOrderSelect.value = DEFAULT_SETTINGS.bookmarkSortOrder;
    if(bookmarkOpenModeSelect) bookmarkOpenModeSelect.value = DEFAULT_SETTINGS.bookmarkOpenMode;
    if(mouseCursorSizeSelect) mouseCursorSizeSelect.value = DEFAULT_SETTINGS.mouseCursorSize;
    if (languageSelector) languageSelector.value = DEFAULT_SETTINGS.selectedLanguage; // 언어 선택도 초기화
    // ... (파일 입력 필드 및 미리보기 초기화)
}

// content.js에서 참조할 커스텀 이미지 상태를 저장하는 함수
function updateCustomImageStatus() {
    // 각 이미지 유형의 커스텀 상태 확인
    const imageKeys = ['backButtonIcon', 'addButtonIcon', 'mouseCursorIcon'];
    
    let customStatusPromises = imageKeys.map(key => {
        return new Promise((resolve) => {
            chrome.storage.local.get(`${key}_customMeta`, (result) => {
                const meta = result[`${key}_customMeta`];
                resolve({
                    key: key,
                    isCustom: !!meta && meta.isCustomImage,
                    // 배경 제거 플래그 전달 (버튼 이미지를 위한 것)
                    removeBackground: !!meta && meta.removeBackground
                });
            });
        });
    });
    
    // 모든 상태 확인 후 저장
    Promise.all(customStatusPromises).then(results => {
        const customStatus = {};
        
        results.forEach(item => {
            customStatus[item.key] = {
                isCustom: item.isCustom,
                removeBackground: item.removeBackground
            };
        });
        
        // 상태 저장 및 content.js에 메시지 전송
        chrome.storage.sync.set({ customImageStatus: customStatus }, () => {
            console.log("커스텀 이미지 상태 업데이트:", customStatus);
            
            // content.js에 상태 변경 알림
            try {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs && tabs.length > 0) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "updateCustomImageStatus",
                            customStatus: customStatus
                        });
                    }
                });
            } catch (e) {
                console.log("탭 메시지 전송 오류:", e);
            }
        });
    });
}

// --- Event Listeners --- 
// 버전 정보 표시 함수
function displayVersionInfo() {
    try {
        const versionElement = document.getElementById('version-info');
        if (versionElement) {
            const manifest = chrome.runtime.getManifest();
            versionElement.textContent = manifest.version;
            console.log("[options.js] 버전 정보 표시:", manifest.version);
        }
    } catch (error) {
        console.error("버전 정보 표시 중 오류:", error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("[options.js] DOMContentLoaded 이벤트 발생");
    restoreOptions();
    displayVersionInfo(); // 버전 정보 표시
    if(optionsForm) optionsForm.addEventListener('submit', saveOptions);
    setupImportButtonListener();
    if (startImportButton) startImportButton.addEventListener('click', handleStartImport);
    if (skipImportButton) skipImportButton.addEventListener('click', handleCloseImportSection);
    
    // loadImportFolderList를 명시적으로 호출하여 폴더 목록 로딩 시도
    console.log("[options.js] DOMContentLoaded - Initial loadImportFolderList call");
    loadImportFolderList();

    // 북마크 폴더 목록 자동 업데이트 리스너 추가 (무한 루프 방지)
    let lastFoldersUpdateTime = 0;
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace === 'local' && changes.allBookmarkFolders) {
            const now = Date.now();
            // 1초 이내에 연속으로 변경되면 무시 (무한 루프 방지)
            if (now - lastFoldersUpdateTime < 1000) {
                console.log('allBookmarkFolders change ignored (too frequent)');
                return;
            }
            lastFoldersUpdateTime = now;
            
            console.log('allBookmarkFolders change detected (options.js):', changes.allBookmarkFolders.newValue);
            if (initialImportSection && !initialImportSection.classList.contains('hidden')) {
                // 디바운싱을 사용해서 추가 지연
                setTimeout(() => {
                    if (!isLoadingFolders) {
                        loadImportFolderList();
                    }
                }, 500);
            }
        }
    });
    
    if (customLayoutButton) {
        customLayoutButton.addEventListener('click', () => {
            // 커스텀 정렬 모드가 아닌 경우 경고 표시
            if (bookmarkSortOrderSelect && bookmarkSortOrderSelect.value !== 'custom') {
                alert(chrome.i18n.getMessage('customLayoutRequirement') || 'To use custom layout, please set the bookmark sort order to "Custom".');
                return;
            }
            chrome.tabs.create({ url: 'custom-layout.html' });
        });
    }
    
    // 북마크 레이아웃 모드 변경 이벤트 리스너 추가
    if (bookmarkLayoutModeSelect) {
        bookmarkLayoutModeSelect.addEventListener('change', function() {
            updateCircleLayoutDescriptionVisibility();
        });
    }
    
    
    // 북마크 정렬 방식 선택 시 이벤트 리스너 추가
    if (bookmarkSortOrderSelect) {
        bookmarkSortOrderSelect.addEventListener('change', updateCustomLayoutButtonState);
    }
    if (languageSelector) {
        languageSelector.addEventListener('change', (event) => {
            const newLang = event.target.value;
            applyLanguage(newLang).then(() => {
                console.log('[BookStaxx] Language change completed, starting dynamic content update');
                
                // 북마크 가져오기 섹션이 표시되어 있으면 새로고침
                if (initialImportSection && !initialImportSection.classList.contains('hidden')) {
                    console.log('[BookStaxx] Refreshing bookmark import section');
                    loadImportFolderList();
                }
                
                // 선택된 폴더 카운트 업데이트
                if (selectedFoldersCount) {
                    updateSelectedFoldersCount();
                }
                
                // 다른 동적 메시지들도 업데이트
                updateDynamicMessages();
                
            }).catch(error => console.error('Error applying language:', error));
        });
    }
    if (resetAllSettingsBtn) {
        resetAllSettingsBtn.addEventListener('click', resetAllSettings);
    } else {
        console.error("resetAllSettingsBtn not found");
    }

    // 파일 미리보기 리스너 등 기타 UI 초기화
    if (backButtonIconInput && backButtonPreview) {
        handleFilePreview(backButtonIconInput, backButtonPreview);
    }
    if (addButtonIconInput && addButtonPreview) {
        handleFilePreview(addButtonIconInput, addButtonPreview);
    }
    if (mouseCursorIconInput && mouseCursorPreview) {
        handleFilePreview(mouseCursorIconInput, mouseCursorPreview);
    }
    // Reset buttons
    if(resetMouseCursorIconBtn) resetMouseCursorIconBtn.addEventListener('click', () => resetImage('mouseCursorIcon', 'mouseCursorPreview', 'mouseCursorNoPreview'));
    if(resetBackButtonIconBtn) resetBackButtonIconBtn.addEventListener('click', () => resetImage('backButtonIcon', 'backButtonPreview', 'backButtonNoPreview'));
    if(resetAddButtonIconBtn) resetAddButtonIconBtn.addEventListener('click', () => resetImage('addButtonIcon', 'addButtonPreview', 'addButtonNoPreview'));

    // Slider for maxBookmarks
    if (maxBookmarksInput) {
        const maxBookmarksValue = document.getElementById('maxBookmarksValue');
        if (maxBookmarksValue) {
            maxBookmarksValue.textContent = maxBookmarksInput.value;
            maxBookmarksInput.addEventListener('input', () => {
                maxBookmarksValue.textContent = maxBookmarksInput.value;
            });
        }
    }

    console.log("[options.js] DOMContentLoaded 이벤트 리스너 설정 완료");

    if (mouseCloseModeSelect && mouseCloseTimeoutContainer) {
        mouseCloseModeSelect.addEventListener('change', function() {
            if (this.value === 'timeout') {
                mouseCloseTimeoutContainer.style.display = '';
            } else {
                mouseCloseTimeoutContainer.style.display = 'none';
            }
        });
    }
    // 슬라이더 값이 바뀌면 저장 버튼 활성화(자동 저장은 하지 않음)
    if (mouseCloseTimeoutInput) {
        mouseCloseTimeoutInput.addEventListener('input', function() {
            // 필요시 실시간 미리보기 등 추가 가능
        });
    }
    if (bookmarkHotkeySelect) {
        bookmarkHotkeySelect.addEventListener('change', () => {
            saveOptions(new Event('submit'));
        });
    }
});

// 언어 변경 시 동적 메시지들을 업데이트하는 함수
function updateDynamicMessages() {
    console.log('[BookStaxx] updateDynamicMessages executing');
    
    // 현재 표시된 오류 메시지나 상태 메시지 업데이트
    const errorMessages = document.querySelectorAll('.text-red-500, .text-red-400');
    errorMessages.forEach(elem => {
        const text = elem.textContent;
        if (text.includes('가져올 북마크 폴더가 없거나') || text.includes('not found') || text.includes('インポート')) {
            const newMsg = getLocalizedMessage("errorNoFoldersToImport") || chrome.i18n.getMessage("errorNoFoldersToImport") || 'No bookmark folders to import or loading failed.';
            elem.textContent = newMsg;
        }
    });
    
    // 로딩 메시지 업데이트
    const loadingMessages = document.querySelectorAll('[data-i18n="loadingFolders"]');
    loadingMessages.forEach(elem => {
        const newMsg = getLocalizedMessage("loadingFolders") || chrome.i18n.getMessage("loadingFolders") || 'Loading bookmark folders...';
        elem.textContent = newMsg;
    });
    
    // 버튼 텍스트 업데이트
    if (startImportButton) {
        const btnMsg = getLocalizedMessage("startImport") || chrome.i18n.getMessage("startImport") || 'Start Import';
        startImportButton.textContent = btnMsg;
    }
    
    console.log('[BookStaxx] updateDynamicMessages completed');
}

async function applyLanguage(lang) {
    let targetLang = lang;

    if (lang === 'auto' || !lang) {
        targetLang = chrome.i18n.getUILanguage().split('-')[0];
        if (!SUPPORTED_LANGUAGES.includes(targetLang)) {
            targetLang = 'en'; 
        }
    }
    console.log(`[BookStaxx applyLanguage] UI 언어 적용 시도: ${targetLang} (선택값: ${lang})`);

    let messagesToUse = null;

    try {
        // Firefox/Chrome 호환 메시지 로드
        const messagesUrl = chrome.runtime.getURL(`_locales/${targetLang}/messages.json`);
        console.log(`[BookStaxx applyLanguage] 메시지 URL: ${messagesUrl}`);
        
        const response = await fetch(messagesUrl);
        console.log(`[BookStaxx applyLanguage] ${targetLang} 응답 상태:`, response.status);
        
        if (response.ok) {
            messagesToUse = await response.json();
            console.log(`[BookStaxx applyLanguage] ${targetLang} 메시지 로드 성공, 키 수:`, Object.keys(messagesToUse).length);
        } else {
            console.warn(`Messages for ${targetLang} not found (${response.status}), falling back to English.`);
            const englishUrl = chrome.runtime.getURL('_locales/en/messages.json');
            const englishResponse = await fetch(englishUrl);
            if (englishResponse.ok) {
                messagesToUse = await englishResponse.json();
                targetLang = 'en';
                console.log(`[BookStaxx applyLanguage] 영어 폴백 성공, 키 수:`, Object.keys(messagesToUse).length);
            } else {
                console.error('English fallback messages not found.');
                // 최후 수단: chrome.i18n API 사용
                const keys = ['errorNoFoldersToImport', 'loadingFolders', 'selectedFoldersLabel', 'foldersUnit'];
                messagesToUse = {};
                keys.forEach(key => {
                    const msg = chrome.i18n.getMessage(key);
                    if (msg) {
                        messagesToUse[key] = { message: msg };
                    }
                });
                console.log(`[BookStaxx applyLanguage] chrome.i18n API 폴백 사용, 키 수:`, Object.keys(messagesToUse).length);
            }
        }
    } catch (error) {
        console.error('Error loading language messages:', error);
        // 최후 폴백: chrome.i18n API 사용
        const keys = ['errorNoFoldersToImport', 'loadingFolders', 'selectedFoldersLabel', 'foldersUnit'];
        messagesToUse = {};
        keys.forEach(key => {
            const msg = chrome.i18n.getMessage(key);
            if (msg) {
                messagesToUse[key] = { message: msg };
            }
        });
        console.log(`[BookStaxx applyLanguage] 예외 시 chrome.i18n API 폴백 사용`);
    }
    
    // Cache the loaded messages for use by getLocalizedMessage
    currentMessages = messagesToUse;

    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        const messageData = messagesToUse[key];
        const message = messageData ? messageData.message : null;
        
        if (message) {
            console.log(`[BookStaxx applyLanguage] Key: ${key}, Message: ${message}`);
            if (elem.tagName === 'BUTTON') {
                let textNode = Array.from(elem.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
                let spanNode = elem.querySelector('span'); 
                if (spanNode && !spanNode.hasAttribute('data-i18n')) {
                    spanNode.textContent = message;
                } else if (textNode) {
                    textNode.textContent = message;
                } else {
                    elem.textContent = message;
                }
            } else if (elem.tagName === 'OPTION' || elem.tagName === 'TITLE') {
                 elem.textContent = message;
                 if(elem.tagName === 'TITLE') document.title = message;
            } else {
                elem.textContent = message;
            }
        } else {
            console.warn(`[BookStaxx applyLanguage] 번역 없음/키 반환: [${key}] for lang '${targetLang}'.`);
        }
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-placeholder');
        const messageData = messagesToUse[key];
        const message = messageData ? messageData.message : null;
        if (message) {
            elem.placeholder = message;
        }
    });

    // 언어 선택 드롭다운에 실제 적용된 언어(targetLang)를 반영 (auto였을 경우)
    if (languageSelector && lang === 'auto') {
        languageSelector.value = targetLang; 
    }
}

// options.js 상단 또는 공유 가능한 위치에 SUPPORTED_LANGUAGES 배열 정의

// Global message cache for current language
let currentMessages = null;

// Helper function to get localized message with proper fallback
function getLocalizedMessage(key, substitutions = []) {
    // First try the cached messages from current language
    if (currentMessages && currentMessages[key]) {
        let message = currentMessages[key].message;
        if (substitutions && substitutions.length > 0) {
            substitutions.forEach((sub, index) => {
                // Handle Chrome extension placeholder format
                message = message.replace(`$${index + 1}`, sub);
                // Handle custom placeholder formats
                message = message.replace(`{imageKey}`, sub);
                message = message.replace(`{error}`, sub);
                message = message.replace(`{count}`, sub);
                // Handle numbered placeholders
                message = message.replace(`{${index}}`, sub);
            });
        }
        return message;
    }
    
    // Fallback to chrome.i18n.getMessage
    const chromeMessage = chrome.i18n.getMessage(key, substitutions);
    if (chromeMessage) {
        return chromeMessage;
    }
    
    // Final fallback messages
    const fallbackMessages = {
        'confirmResetImage': 'Are you sure you want to reset the {imageKey} image?',
        'confirmResetSettings': 'Are you sure you want to reset all settings?',
        'settingsSavedSuccess': 'Settings saved!',
        'settingsSaveError': 'Error saving settings: {error}',
        'resettingSettings': 'Resetting all settings...',
        'errorResettingSettings': 'Error resetting settings.',
        'settingsResetSuccess': 'All settings have been reset.',
        'imageResetSuccess': 'The {imageKey} image has been reset.',
        'imageResetError': 'Error resetting the {imageKey} image.'
    };
    
    let fallbackMessage = fallbackMessages[key];
    if (fallbackMessage && substitutions && substitutions.length > 0) {
        substitutions.forEach((sub, index) => {
            fallbackMessage = fallbackMessage.replace(`{imageKey}`, sub);
            fallbackMessage = fallbackMessage.replace(`{error}`, sub);
        });
    }
    
    return fallbackMessage || `Missing translation: ${key}`;
}