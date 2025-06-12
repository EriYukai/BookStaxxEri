// 서비스 워커 초기화 시 로그
// console.log("BookStaxx 서비스 워커 초기화 시작");

// 디버그 모드 설정 (false로 설정하여 로그 출력 비활성화)
const DEBUG_MODE = false;

// 강화된 전역 오류 핸들러 - 연결 오류 완전 억제 (background.js용)
(function suppressAllConnectionErrorsInBackground() {
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
    
    // 2. 전역 오류 이벤트 처리 (service worker용)
    if (typeof self !== 'undefined' && self.addEventListener) {
        self.addEventListener('error', function(event) {
            const errorMessage = event.error?.message || event.message || '';
            const isConnectionError = errorMessage.includes('Could not establish connection') ||
                                    errorMessage.includes('Receiving end does not exist') ||
                                    errorMessage.includes('Extension context invalidated');
            
            if (isConnectionError) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        }, true);
        
        self.addEventListener('unhandledrejection', function(event) {
            const errorMessage = event.reason?.message || event.reason || '';
            const isConnectionError = typeof errorMessage === 'string' && (
                errorMessage.includes('Could not establish connection') ||
                errorMessage.includes('Receiving end does not exist') ||
                errorMessage.includes('Extension context invalidated')
            );
            
            if (isConnectionError) {
                event.preventDefault();
                return false;
            }
        }, true);
    }
})();

// 서비스 워커 활성화 상태 유지
(() => {
  // 서비스 워커 비활성화 방지
  if ('serviceWorker' in navigator) {
    // console.log("서비스 워커 등록 유지 기능 활성화");
    
    // 서비스 워커 활성 상태 주기적 확인
    setInterval(() => {
      // console.log("서비스 워커 활성 상태 유지 중...");
      // 자기 자신에게 핑 메시지 보내서 활성 상태 유지
      try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: "keepAlive", timestamp: Date.now() })
            .catch(() => {}); // 모든 연결 오류 완전 무시
        }
      } catch (e) {
        // 모든 예외 완전 무시 (연결 오류 포함)
      }
    }, 8000); // 8초마다 킵얼라이브 메시지 전송 (연결 안정성 향상)
  }
})();

// 전역 변수
const BOOKSTAXX_FOLDER_NAME = "BookStaxx";
let bookStaxxFolderId = null;
let isInitialized = false;

// 컨텍스트 메뉴 ID
const CONTEXT_MENU_ID = "bookstaxx-showBookmarkBar";
let contextMenuCreated = false;

// 설정 기본값 - 스크린샷의 현재 상태로 설정
const DEFAULT_SETTINGS = {
    maxBookmarks: 100, // 스크린샷 상태: 100개
    openInNewTab: true,
    focusNewTab: true,
    autoCloseAfterSelect: true,
    bookmarkIconSize: 64, // 스크린샷 상태: 크기 (64px)
    bookmarkFontSize: 12, // 스크린샷 상태: 작은 (12px)
    bookmarkLayoutMode: 'circle', // 스크린샷 상태: 원형
    bookmarkSortOrder: 'recent', // 스크린샷 상태: 최신 순
    titleLengthLimit: 6,
    showBookmarkTitles: true, // 스크린샷 상태: 북마크 제목 표시 체크됨
    mouseCloseMode: 'button', // 기본값: 마우스버튼
    mouseCloseTimeout: 5,      // 기본값: 5초
    selectedLanguage: 'auto',   // 기본값: 자동 감지
    bookmarkHotkey: 'ctrl+shift+a' // 기본값을 Ctrl+Shift+A로 변경
};

// 활성 상태 탭 ID 추적
let activeTabId = null;

// 컨텍스트 무효화 추적 객체
const invalidatedContexts = {};

// 향상된 디버깅을 위한 로그 함수
function logDebug(message, data) {
    // DEBUG_MODE가 false인 경우 로그 출력하지 않음
    if (!DEBUG_MODE) return;
    
    const timestamp = new Date().toISOString();
    const logMessage = `[BookStaxx ${timestamp}] ${message}`;
    
    if (data) {
        console.log(logMessage, data);
    } else {
        console.log(logMessage);
    }
}

// 초기화 함수
function initialize() {
  return new Promise((resolve, reject) => {
    if (DEBUG_MODE) console.log("BookStaxx 서비스 워커 초기화 중...");
    
    // BookStaxx 폴더 초기화
    initBookStaxxFolder()
      .then(() => {
        if (DEBUG_MODE) console.log("BookStaxx 초기화 완료, 폴더 ID:", bookStaxxFolderId);
        isInitialized = true;
        
        // 컨텍스트 메뉴 생성
        createContextMenu()
          .then(() => resolve())
          .catch(error => {
            if (DEBUG_MODE) console.error("컨텍스트 메뉴 생성 중 오류:", error);
            // 메뉴 생성 실패해도 초기화는 성공으로 처리
            resolve();
          });
      })
      .catch(error => {
        if (DEBUG_MODE) console.error("BookStaxx 초기화 실패:", error);
        // 초기화 실패 시에도 살아있는 상태 유지
        isInitialized = false;
        
        // 30초 후 재시도
        setTimeout(() => {
          if (DEBUG_MODE) console.log("초기화 재시도...");
          initialize().catch(e => { if (DEBUG_MODE) console.error("재시도 초기화 실패:", e); });
        }, 30000);
        
        reject(error);
      });
  });
}

// Firefox bookmark folder IDs
const FIREFOX_BOOKMARK_FOLDERS = {
  toolbar: "toolbar_____",
  menu: "menu________",
  unfiled: "unfiled_____"
};

// Detect if running in Firefox
function isFirefox() {
  // Check for Firefox-specific APIs or user agent
  return typeof browser !== 'undefined' || 
         (navigator.userAgent && navigator.userAgent.toLowerCase().includes('firefox'));
}

// Get the appropriate root folder ID
async function getRootBookmarkFolderId() {
  if (isFirefox()) {
    // Try Firefox folder IDs in order of preference
    const folderIds = [FIREFOX_BOOKMARK_FOLDERS.toolbar, FIREFOX_BOOKMARK_FOLDERS.menu, FIREFOX_BOOKMARK_FOLDERS.unfiled];
    
    for (const folderId of folderIds) {
      try {
        await chrome.bookmarks.get(folderId);
        return folderId;
      } catch (e) {
        // Try next folder
      }
    }
    
    // If all fail, try Chrome's ID as fallback
    return "1";
  } else {
    // Chrome uses "1" for Bookmarks Bar
    return "1";
  }
}

// BookStaxx 폴더 초기화 (Promise로 변환)
function initBookStaxxFolder() {
  return new Promise(async (resolve, reject) => {
    try {
      const rootFolderId = await getRootBookmarkFolderId();
      logDebug("Using root folder ID:", rootFolderId);
      
      chrome.bookmarks.getChildren(rootFolderId, function(bookmarks) {
        if (chrome.runtime.lastError) {
          if (DEBUG_MODE) console.error("북마크 가져오기 실패:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        // 기존 BookStaxx 폴더 찾기
        let found = false;
        
        for (let i = 0; i < bookmarks.length; i++) {
          if (bookmarks[i].title === BOOKSTAXX_FOLDER_NAME && !bookmarks[i].url) {
            bookStaxxFolderId = bookmarks[i].id;
            found = true;
            if (DEBUG_MODE) console.log("기존 BookStaxx 폴더 발견:", bookStaxxFolderId);
            resolve(bookStaxxFolderId);
            return;
          }
        }
        
        // 폴더가 없으면 생성
        if (!found) {
          try {
            chrome.bookmarks.create({
              parentId: rootFolderId,
              title: BOOKSTAXX_FOLDER_NAME
            }, function(result) {
              if (chrome.runtime.lastError) {
                if (DEBUG_MODE) console.error("BookStaxx 폴더 생성 실패:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
              }
              
              bookStaxxFolderId = result.id;
              if (DEBUG_MODE) console.log("새 BookStaxx 폴더 생성됨:", bookStaxxFolderId);
              resolve(bookStaxxFolderId);
            });
          } catch (createError) {
            if (DEBUG_MODE) console.error("북마크 폴더 생성 중 예외 발생:", createError);
            reject(createError);
          }
        }
      });
    } catch (error) {
      if (DEBUG_MODE) console.error("북마크 폴더 초기화 오류:", error);
      reject(error);
    }
  });
}

// 컨텍스트 메뉴 생성 함수
function createContextMenu() {
  return new Promise((resolve, reject) => {
    try {
      if (contextMenuCreated) {
        if (DEBUG_MODE) console.log("컨텍스트 메뉴가 이미 생성됨");
        resolve();
        return;
      }
      
      chrome.contextMenus.removeAll(function() {
        if (chrome.runtime.lastError) {
          if (DEBUG_MODE) console.error("컨텍스트 메뉴 제거 중 오류:", chrome.runtime.lastError);
        }
        
        try {
          chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: chrome.i18n.getMessage("contextMenuTitle") || "Open BookStaxx Bookmark Bar", // 국제화된 제목 사용
            contexts: ["page"]
          }, function() {
            if (chrome.runtime.lastError) {
              if (DEBUG_MODE) console.error("컨텍스트 메뉴 생성 실패:", chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              if (DEBUG_MODE) console.log("컨텍스트 메뉴 생성 성공");
              contextMenuCreated = true;
              resolve();
            }
          });
        } catch (error) {
          if (DEBUG_MODE) console.error("컨텍스트 메뉴 생성 중 예외 발생:", error);
          reject(error);
        }
      });
    } catch (error) {
      if (DEBUG_MODE) console.error("createContextMenu 함수 실행 중 오류:", error);
      reject(error);
    }
  });
}

const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh_CN', 'es', 'fr', 'de', 'ru', 'pt_BR', 'hi'];

async function loadAndStoreMessages() {
    for (const lang of SUPPORTED_LANGUAGES) {
        try {
            const messagesUrl = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const response = await fetch(messagesUrl);
            if (!response.ok) {
                console.warn(`Failed to fetch messages for ${lang}: ${response.statusText}`);
                continue;
            }
            const messages = await response.json();
            await chrome.storage.local.set({ [`i18n_${lang}`]: messages });
            console.log(`Messages for ${lang} loaded and stored.`);
        } catch (error) {
            console.error(`Error loading/storing messages for ${lang}:`, error);
        }
    }
}

async function loadAndStoreAllBookmarkFolders() {
    logDebug("백그라운드에서 모든 북마크 폴더 로드 및 저장 시작");
    try {
        // Firefox에서 더 안정적인 북마크 API 호출
        let treeNodes = null;
        
        try {
            // 먼저 Promise 기반 API 시도 (modern Firefox)
            if (typeof browser !== 'undefined' && browser.bookmarks && browser.bookmarks.getTree) {
                logDebug("Firefox browser.bookmarks API 사용");
                treeNodes = await browser.bookmarks.getTree();
            } else {
                // Chrome 스타일 콜백 API 사용
                logDebug("Chrome 스타일 bookmarks API 사용");
                treeNodes = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error("북마크 API 호출 시간 초과"));
                    }, 10000);
                    
                    chrome.bookmarks.getTree(nodes => {
                        clearTimeout(timeout);
                        if (chrome.runtime.lastError) {
                            logDebug("북마크 getTree 오류:", chrome.runtime.lastError);
                            return reject(chrome.runtime.lastError);
                        }
                        if (!nodes || nodes.length === 0) {
                            logDebug("북마크 트리가 비어있음");
                            return reject(new Error("북마크 트리가 비어있습니다"));
                        }
                        resolve(nodes);
                    });
                });
            }
            
            if (!treeNodes || treeNodes.length === 0) {
                throw new Error("북마크 트리가 비어있거나 null입니다");
            }
            
        } catch (initialError) {
            logDebug("첫 번째 북마크 API 호출 실패, 대안 시도:", initialError);
            
            // 대안: 개별 폴더 ID로 접근 시도
            try {
                const firefoxMode = isFirefox();
                if (firefoxMode) {
                    logDebug("Firefox 개별 폴더 접근 시도");
                    const folderIds = [
                        FIREFOX_BOOKMARK_FOLDERS.toolbar,
                        FIREFOX_BOOKMARK_FOLDERS.menu,
                        FIREFOX_BOOKMARK_FOLDERS.unfiled
                    ];
                    
                    const rootNodes = [];
                    for (const folderId of folderIds) {
                        try {
                            const folderNode = await new Promise((resolve, reject) => {
                                chrome.bookmarks.getSubTree(folderId, nodes => {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                    } else {
                                        resolve(nodes);
                                    }
                                });
                            });
                            if (folderNode && folderNode.length > 0) {
                                rootNodes.push(...folderNode);
                            }
                        } catch (e) {
                            logDebug(`폴더 ${folderId} 접근 실패:`, e);
                        }
                    }
                    
                    if (rootNodes.length > 0) {
                        treeNodes = rootNodes;
                        logDebug(`Firefox 개별 폴더 접근 성공, ${rootNodes.length}개 루트 노드`);
                    } else {
                        throw new Error("Firefox 개별 폴더 접근도 실패");
                    }
                } else {
                    throw initialError;
                }
            } catch (secondError) {
                logDebug("모든 북마크 API 접근 방법 실패:", secondError);
                throw secondError;
            }
        }

        const allFolders = [];
        const firefoxMode = isFirefox();
        
        function traverse(nodes, level = 0) {
            for (const node of nodes) {
                // Include all folders except the root
                if (node.id !== "0" && !node.url) {
                    if (node.title !== BOOKSTAXX_FOLDER_NAME) {
                        let title = node.title;
                        
                        // Handle Firefox special folder names
                        if (firefoxMode) {
                            switch (node.id) {
                                case FIREFOX_BOOKMARK_FOLDERS.toolbar:
                                    title = title || "Bookmarks Toolbar";
                                    break;
                                case FIREFOX_BOOKMARK_FOLDERS.menu:
                                    title = title || "Bookmarks Menu";
                                    break;
                                case FIREFOX_BOOKMARK_FOLDERS.unfiled:
                                    title = title || "Other Bookmarks";
                                    break;
                            }
                        } else {
                            // Chrome folder name defaults
                            if (node.id === "1") title = title || "Bookmarks Bar";
                            if (node.id === "2") title = title || "Other Bookmarks";
                        }
                        
                        allFolders.push({
                            id: node.id,
                            title: title,
                            parentId: node.parentId,
                            level: level,
                        });
                    }
                }
                if (node.children && node.children.length > 0) {
                    traverse(node.children, level + 1);
                }
            }
        }
        if (treeNodes && treeNodes.length > 0) {
            traverse(treeNodes);
            logDebug(`북마크 트리에서 ${allFolders.length}개의 폴더를 찾았습니다.`);
        } else {
            logDebug("북마크 트리가 비어있거나 null입니다.");
        }
        
        allFolders.sort((a, b) => {
            if (a.level !== b.level) return a.level - b.level;
            return (a.title || '').localeCompare(b.title || '');
        });

        await chrome.storage.local.set({ allBookmarkFolders: allFolders });
        logDebug(`모든 북마크 폴더 ${allFolders.length}개를 로컬 스토리지에 저장했습니다.`);

        // 저장된 데이터 즉시 확인 로그 추가
        chrome.storage.local.get('allBookmarkFolders', result => {
            if (chrome.runtime.lastError) {
                logDebug("저장된 폴더 목록 확인 중 오류 (background):", chrome.runtime.lastError);
            } else {
                logDebug("저장된 폴더 목록 즉시 확인 (background):", result.allBookmarkFolders ? result.allBookmarkFolders.length + "개 폴더" : "폴더 없음 또는 로드 실패");
                // logDebug("저장된 폴더 목록 상세 (background):", result.allBookmarkFolders);
            }
        });

    } catch (error) {
        logDebug("모든 북마크 폴더 로드 및 저장 중 오류:", error);
    }
}

// 확장 프로그램 설치/업데이트 시 실행
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    logDebug("확장 프로그램 설치/업데이트 감지:", details.reason);
    
    // 비동기 작업들을 안전하게 처리
    try {
      await loadAndStoreMessages();
    } catch (error) {
      console.error("메시지 로드 중 오류:", error);
    }
    
    try {
      await loadAndStoreAllBookmarkFolders();
    } catch (error) {
      console.error("북마크 폴더 로드 중 오류:", error);
    }
  } catch (error) {
    console.error("설치/업데이트 초기화 중 오류:", error);
  }
  
  // 기본 설정 저장 및 누락된 설정 보완
  chrome.storage.sync.get(null, function(data) {
    let needsUpdate = false;
    const updatedSettings = {};
    
    // 모든 기본 설정 키를 확인하여 누락된 것이 있으면 추가
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      if (data[key] === undefined && (!data.settings || data.settings[key] === undefined)) {
        updatedSettings[key] = DEFAULT_SETTINGS[key];
        needsUpdate = true;
      }
    });
    
    // 기본 설정이 전혀 없는 경우 전체 기본 설정 저장
    if (!data.settings) {
      updatedSettings.settings = DEFAULT_SETTINGS;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      chrome.storage.sync.set(updatedSettings, function() {
        logDebug("기본 설정이 저장되었습니다:", updatedSettings);
      });
    } else {
      logDebug("모든 기본 설정이 이미 존재합니다");
    }
  });
  
  // 업데이트 또는 설치 시 옵션 페이지 열기 여부 확인
  if (details.reason === "install") {
    // 확장 프로그램 첫 설치 시 옵션 페이지 열기
    chrome.tabs.create({ url: "options.html" });
    logDebug("첫 설치로 인해 옵션 페이지가 열렸습니다");
  } else if (details.reason === "update") {
    // 주요 버전 업데이트인 경우에만 옵션 페이지 열기
    const previousVersion = details.previousVersion || "0.0.0";
    const currentVersion = chrome.runtime.getManifest().version;
    
    const previousMajor = parseInt(previousVersion.split('.')[0]);
    const currentMajor = parseInt(currentVersion.split('.')[0]);
    
    if (currentMajor > previousMajor) {
      chrome.tabs.create({ url: "options.html?updated=true" });
      logDebug(`메이저 버전 업데이트 (${previousVersion} -> ${currentVersion})로 인해 옵션 페이지가 열렸습니다`);
    } else {
      logDebug(`확장 프로그램이 업데이트되었습니다: ${previousVersion} -> ${currentVersion}`);
    }
  }
  
  // 초기화 시도 - 안전한 방식으로 처리
  try {
    const initResult = initialize();
    if (initResult && typeof initResult.catch === 'function') {
      initResult.catch(error => {
        console.error("초기 설치/업데이트 초기화 실패:", error);
        // 실패 시 30초 후 재시도
        setTimeout(() => {
          try {
            initialize().catch(retryError => {
              console.error("재시도 초기화도 실패:", retryError);
            });
          } catch (retryError) {
            console.error("재시도 초기화 중 예외:", retryError);
          }
        }, 30000);
      });
    }
  } catch (error) {
    console.error("초기화 호출 중 예외:", error);
  }
});

// 서비스 워커 활성화 시 실행
chrome.runtime.onStartup.addListener(async () => {
  try {
    console.log("브라우저 시작 시 BookStaxx 서비스 워커 활성화");
    
    // 비동기 작업들을 안전하게 처리
    try {
      await loadAndStoreMessages();
    } catch (error) {
      console.error("시작 시 메시지 로드 중 오류:", error);
    }
    
    try {
      await loadAndStoreAllBookmarkFolders();
    } catch (error) {
      console.error("시작 시 북마크 폴더 로드 중 오류:", error);
    }
    
    // 초기화 시도 - 안전한 방식으로 처리
    try {
      const initResult = initialize();
      if (initResult && typeof initResult.catch === 'function') {
        initResult.catch(error => {
          console.error("브라우저 시작 시 초기화 실패:", error);
          // 실패 시 30초 후 재시도
          setTimeout(() => {
            try {
              initialize().catch(retryError => {
                console.error("시작 시 재시도 초기화도 실패:", retryError);
              });
            } catch (retryError) {
              console.error("시작 시 재시도 초기화 중 예외:", retryError);
            }
          }, 30000);
        });
      }
    } catch (error) {
      console.error("시작 시 초기화 호출 중 예외:", error);
    }
  } catch (error) {
    console.error("브라우저 시작 시 전체 초기화 중 오류:", error);
  }
});

// 컨텍스트 메뉴 클릭 이벤트
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    chrome.tabs.sendMessage(tab.id, { action: "showBookmarkBar" });
  }
});

// 탭 활성화 추적 (현재 활성 탭 ID 기록)
chrome.tabs.onActivated.addListener(function(activeInfo) {
    activeTabId = activeInfo.tabId;
    logDebug("활성 탭 변경됨:", activeTabId);
});

// 북마크 변경 감지 리스너 추가
chrome.bookmarks.onCreated.addListener(loadAndStoreAllBookmarkFolders);
chrome.bookmarks.onRemoved.addListener(loadAndStoreAllBookmarkFolders);
chrome.bookmarks.onChanged.addListener(loadAndStoreAllBookmarkFolders);
chrome.bookmarks.onMoved.addListener(loadAndStoreAllBookmarkFolders);

// 메시지 리스너 - 개선된 오류 처리
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // 안전한 로깅
  try {
    logDebug("메시지 수신:", { action: request?.action, sender: sender?.tab?.url || "확장 프로그램" });
  } catch (logError) {
    console.warn("메시지 로깅 중 오류:", logError);
  }
  
  // 요청 유효성 검사
  if (!request || typeof request !== 'object') {
    try {
      sendResponse({ success: false, error: "잘못된 요청 형식" });
    } catch (responseError) {
      console.error("응답 전송 중 오류:", responseError);
    }
    return false;
  }
  
  try {
    // 킵얼라이브 메시지 처리
    if (request.action === "keepAlive") {
      // 단순히 응답만 반환하여 서비스 워커 활성 상태 유지
      sendResponse({ success: true, timestamp: Date.now() });
      return true;
    }
    
    // 확장 프로그램 재초기화 요청 처리
    if (request.action === "reinitialize") {
      logDebug("재초기화 요청 수신됨");
      
      try {
        const tabId = sender.tab ? sender.tab.id : null;
        const tabUrl = sender.tab ? sender.tab.url : null;
        
        if (!tabId || !tabUrl) {
          logDebug("재초기화 실패: 유효한 탭 ID 또는 URL 없음");
          sendResponse({ success: false, error: "유효한 탭 정보 없음" });
          return true;
        }
        
        // 컨텍스트 무효화 상태 추적
        const contextKey = `${tabId}:${tabUrl}`;
        invalidatedContexts[contextKey] = {
          timestamp: Date.now(),
          recoveryAttempt: request.recoveryAttempt || 1,
          isIframe: request.isIframe || false,
          isRestrictedSite: request.isRestrictedSite || false
        };
        
        // 제한된 사이트에서는 컨텍스트 재주입을 적게 시도
        const isRestrictedSite = request.isRestrictedSite;
        if (isRestrictedSite && request.recoveryAttempt > 2) {
          logDebug(`제한된 사이트에서 과도한 재초기화 요청 제한 (시도: ${request.recoveryAttempt})`, { tabId, tabUrl });
          sendResponse({ 
            success: false, 
            limited: true, 
            message: "제한된 사이트에서 재초기화 횟수 제한" 
          });
          return true;
        }
        
        // 탭이 존재하는지 확인
        chrome.tabs.get(tabId, function(tab) {
          if (chrome.runtime.lastError) {
            logDebug(`재초기화 실패: 탭을 찾을 수 없음 (${tabId})`, chrome.runtime.lastError);
            sendResponse({ success: false, error: "탭을 찾을 수 없음" });
            return;
          }
          
          // 탭이 유효하고 로드된 상태인지 확인
          if (!tab || tab.status !== 'complete') {
            logDebug(`재초기화 실패: 탭이 완전히 로드되지 않음 (${tabId}, 상태: ${tab ? tab.status : '없음'})`);
            sendResponse({ success: false, error: "탭이 완전히 로드되지 않음" });
            return;
          }
          
          // content script 재주입 시도
          try {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            }, function(results) {
              if (chrome.runtime.lastError) {
                logDebug(`컨텐츠 스크립트 재주입 실패: ${chrome.runtime.lastError.message}`);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
              }
              
              // CSS 재주입 (인터페이스가 제대로 보이도록)
              chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['styles.css']
              }, function() {
                if (chrome.runtime.lastError) {
                  logDebug(`CSS 재주입 실패: ${chrome.runtime.lastError.message}`);
                  // CSS 실패는 치명적이지 않으므로 성공으로 처리
                }
                
                logDebug(`탭 ${tabId}에 컨텐츠 스크립트 재주입 성공`);
                sendResponse({ success: true });
              });
            });
          } catch (scriptError) {
            logDebug(`스크립트 실행 중 예외 발생: ${scriptError.message}`);
            sendResponse({ success: false, error: scriptError.message });
          }
        });
        
        return true; // 비동기 응답을 위해 true 반환
      } catch (error) {
        logDebug("재초기화 중 예외 발생:", error);
        sendResponse({ success: false, error: error.message });
        return true;
      }
    }
    
    // 컨텍스트 유효성 확인을 위한 핑
    if (request.action === "ping") {
      logDebug("핑 요청 수신됨");
      try {
        // 핑 요청에 즉시 응답하여 지연 방지
        sendResponse({ 
          success: true, 
          message: "pong",
          initialized: isInitialized,
          folderId: bookStaxxFolderId,
          timestamp: Date.now(),
          version: chrome.runtime.getManifest().version
        });
      } catch (responseError) {
        console.error("핑 응답 중 오류:", responseError);
        // 실패한 경우 간단한 객체 반환
        sendResponse({ success: false, error: responseError.message });
      }
      return true;
    }
    
    // 북마크 가져오기
    if (request.action === "getBookmarks") {
      try {
        // 초기화되지 않은 상태에서 요청이 온 경우
        if (!isInitialized || !bookStaxxFolderId) {
          console.log("북마크 요청 시 초기화되지 않은 상태. 초기화 시도 후 처리합니다.");
          
          initBookStaxxFolder()
            .then((folderId) => {
              isInitialized = true;
              bookStaxxFolderId = folderId;
              console.log("지연된 초기화 완료. 북마크 요청 처리 계속...");
              
              // 북마크 트리 로드
              getBookmarksTree(sendResponse);
            })
            .catch(error => {
              console.error("북마크 요청 처리 중 초기화 실패:", error);
              sendResponse({ success: false, error: "북마크 폴더를 초기화할 수 없습니다." });
            });
          
          return true; // 비동기 응답을 위해 true 반환
        }
        
        // 이미 초기화된 경우 바로 북마크 가져오기
        getBookmarksTree(sendResponse);
        
        return true; // 비동기 응답을 위해 true 반환
      } catch (error) {
        console.error("북마크 가져오기 처리 중 오류:", error);
        sendResponse({ success: false, error: "북마크 처리 중 오류가 발생했습니다." });
        return true;
      }
    }

    // 북마크 트리 가져오는 내부 함수
    function getBookmarksTree(sendResponse) {
      chrome.bookmarks.getTree(function(bookmarkTree) {
        if (chrome.runtime.lastError) {
          console.error("북마크 트리 가져오기 실패:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        try {
          const bookmarks = processBookmarks(bookmarkTree);
          
          // 실제 북마크 개수 로깅 추가
          let totalBookmarkCount = 0;
          bookmarks.forEach(folder => {
            if (folder.children) {
              totalBookmarkCount += folder.children.filter(child => child.type === 'bookmark').length;
              folder.children.forEach(subfolder => {
                if (subfolder.type === 'folder' && subfolder.children) {
                  totalBookmarkCount += subfolder.children.filter(child => child.type === 'bookmark').length;
                }
              });
            }
          });
          
          console.log(`[Background] BookStaxx 폴더에서 총 ${totalBookmarkCount}개의 북마크 발견`);
          console.log(`[Background] 반환되는 북마크 구조:`, bookmarks);
          
          sendResponse({ success: true, bookmarks: bookmarks });
        } catch (processError) {
          console.error("북마크 처리 중 오류:", processError);
          sendResponse({ success: false, error: "북마크 처리 중 오류가 발생했습니다." });
        }
      });
    }
    
    // 마우스 커서 크기 정보 처리
    if (request.action === "updateCursorSizeInfo") {
      // 마우스 커서 크기 정보 저장
      logDebug("마우스 커서 크기 정보 수신:", request);
      
      try {
        // 커서 크기 정보를 스토리지에 저장
        chrome.storage.local.set({ 
          cursorSizeInfo: {
            size: request.cursorSize || 32, // 픽셀 단위 크기 (기본값 32px)
            setting: request.cursorSetting || 'normal', // 설정값 (normal, large, xlarge)
            timestamp: Date.now() // 업데이트 시간
          }
        }, function() {
          if (chrome.runtime.lastError) {
            logDebug("커서 크기 정보 저장 실패:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          
          logDebug("커서 크기 정보 저장 완료:", request.cursorSize);
          sendResponse({ success: true });
        });
        
        return true; // 비동기 응답을 위해 true 반환
      } catch (error) {
        logDebug("커서 크기 정보 처리 중 오류:", error);
        sendResponse({ success: false, error: error.message });
        return true;
      }
    }
    
    // 북마크 열기
    if (request.action === "openBookmark") {
      // 요청 데이터 확인 로그
      console.log("북마크 열기 요청 원본 데이터:", request);
      
      // 디버그 정보 있으면 추가 출력
      if (request.debug) {
        console.log("추가 디버그 정보:", request.debug);
      }
      
      // openInNewTab을 명확하게 확인하고 boolean으로 변환
      let openInNewTab = true; // 기본값
      
      // request.openInNewTab이 명확한 boolean일 때만 사용
      if (typeof request.openInNewTab === 'boolean') {
        openInNewTab = request.openInNewTab;
        console.log(`openInNewTab 값이 boolean으로 전달됨: ${openInNewTab}`);
      } else if (request.openInNewTab !== undefined) {
        // boolean이 아니지만 값이 있으면 명시적으로 변환
        openInNewTab = Boolean(request.openInNewTab);
        console.log(`openInNewTab 값이 ${typeof request.openInNewTab} 타입이라 boolean으로 변환: ${openInNewTab}`);
      } else {
        console.log(`openInNewTab 값이 없어서 기본값 적용: ${openInNewTab}`);
      }
      
      // 직접 한번 더 settings를 체크
      chrome.storage.sync.get(['bookmarkOpenMode'], function(result) {
        const storedMode = result.bookmarkOpenMode;
        console.log(`스토리지에서 직접 확인한 bookmarkOpenMode: ${storedMode}`);
        
        // 스토리지 값이 current면 openInNewTab을 무조건 false로 설정
        if (storedMode === 'current') {
          console.log('스토리지 값이 current이므로 현재 탭에서 열기로 강제 설정');
          openInNewTab = false;
        }
        
        // 최종 결정 로그
        console.log(`최종 결정: URL ${request.url}을(를) ${openInNewTab ? '새 탭에서' : '현재 탭에서'} 열기`);
        
        try {
          // 실제 북마크 열기 실행
          if (openInNewTab) {
            console.log(`새 탭에서 북마크 열기 실행: ${request.url}`);
            chrome.tabs.create({ url: request.url, active: true });
          } else {
            console.log(`현재 탭에서 북마크 열기 실행: ${request.url}`);
            chrome.tabs.update({ url: request.url });
          }
          console.log("북마크 열기 작업 완료");
          sendResponse({ success: true, openedIn: openInNewTab ? 'newTab' : 'currentTab' });
        } catch (error) {
          console.error("북마크 열기 중 오류 발생:", error);
          sendResponse({ success: false, error: error.message });
        }
      });
      
      return true; // 비동기 응답을 위해 true 반환
    }
    
    // 북마크 추가
    if (request.action === "addBookmark") {
      if (!request.url || !request.title) {
        sendResponse({ success: false, error: "URL과 제목이 필요합니다." });
        return true;
      }
      
      // BookStaxx 폴더가 초기화되지 않은 경우
      if (!bookStaxxFolderId) {
        initBookStaxxFolder().then((folderId) => {
          // 북마크 추가
          addBookmarkToFolder(request.title, request.url, function(result) {
            if (result.success) {
              sendResponse({ success: true, bookmark: result.bookmark });
            } else {
              sendResponse({ success: false, error: result.error });
            }
          });
        }).catch(error => {
          sendResponse({ success: false, error: "BookStaxx 폴더 초기화 실패: " + error.message });
        });
      } else {
        // 북마크 추가
        addBookmarkToFolder(request.title, request.url, function(result) {
          if (result.success) {
            sendResponse({ success: true, bookmark: result.bookmark });
          } else {
            sendResponse({ success: false, error: result.error });
          }
        });
      }
      
      return true; // 비동기 응답을 위해 true 반환
    }
    
    // 설정 가져오기
    if (request.action === "getSettings") {
      chrome.storage.sync.get(null, function(data) {
        // 로그 추가: 전체 데이터 확인용
        console.log("저장된 전체 설정 데이터:", data);
        
        // 설정 객체 준비
        const settings = {};
        
        // 기본 설정의 각 키에 대해 저장된 값이 있는지 확인하고 병합
        Object.keys(DEFAULT_SETTINGS).forEach(key => {
          if (data[key] !== undefined) {
            settings[key] = data[key];
          } else if (data.settings && data.settings[key] !== undefined) {
            // 이전 방식으로 저장된 경우 (settings 객체 내부에 있는 경우)
            settings[key] = data.settings[key];
          } else {
            // 저장된 값이 없으면 기본값 사용
            settings[key] = DEFAULT_SETTINGS[key];
          }
        });
        
        // bookmarkAnimationMode 설정 확인 및 추가
        if (data.bookmarkAnimationMode !== undefined) {
          settings.bookmarkAnimationMode = data.bookmarkAnimationMode;
        } else if (data.settings && data.settings.bookmarkAnimationMode !== undefined) {
          settings.bookmarkAnimationMode = data.settings.bookmarkAnimationMode;
        } else {
          // 기본값으로 'shoot' 사용
          settings.bookmarkAnimationMode = 'shoot';
        }

        console.log("북마크 애니메이션 모드:", settings.bookmarkAnimationMode);
        
        // 숫자로 변환해야 하는 설정들 처리
        ['maxBookmarks', 'bookmarkIconSize', 'bookmarkFontSize', 'titleLengthLimit'].forEach(key => {
          if (typeof settings[key] === 'string') {
            settings[key] = parseInt(settings[key], 10);
          }
        });
        
        logDebug("설정 요청에 응답 (병합된 설정):", settings);
        sendResponse({ success: true, settings: settings });
      });
      
      return true; // 비동기 응답을 위해 true 반환
    }
    
    // 최상위 북마크 폴더 가져오기
    if (request.action === "getTopLevelFolders") {
      // 이제 이 액션은 직접 폴더를 반환하는 대신, 스토리지에서 읽도록 클라이언트에 안내하거나,
      // 여전히 실시간 조회를 원한다면 loadAllBookmarkFolders를 호출하고 결과를 sendResponse로 보내도록 유지할 수 있음.
      // 여기서는 스토리지 사용 방식으로 변경 예정이므로, 이 핸들러는 deprecated 될 수 있음.
      // 하지만 호환성을 위해 임시로 유지하고, 클라이언트(options.js)를 먼저 수정하는 것을 권장.
      // loadAllBookmarkFolders(sendResponse); // 이 부분은 options.js 변경 후 제거 또는 수정
      // 임시로, 스토리지에서 읽어 반환하는 방식으로 변경
      (async () => {
          try {
              logDebug("getTopLevelFolders 요청 시작");
              const data = await chrome.storage.local.get('allBookmarkFolders');
              if (data.allBookmarkFolders && data.allBookmarkFolders.length > 0) {
                  logDebug(`getTopLevelFolders: 로컬 스토리지에서 ${data.allBookmarkFolders.length}개 폴더 반환`);
                  sendResponse({ success: true, folders: data.allBookmarkFolders });
              } else {
                  logDebug("getTopLevelFolders: 로컬 스토리지에 폴더 없음, 실시간 로드 시도");
                  // 폴더가 없을 경우 한번 더 로드 시도 (background 시작 직후 등)
                  await loadAndStoreAllBookmarkFolders();
                  const newData = await chrome.storage.local.get('allBookmarkFolders');
                  if (newData.allBookmarkFolders && newData.allBookmarkFolders.length > 0) {
                      logDebug(`getTopLevelFolders: 새로 로드한 ${newData.allBookmarkFolders.length}개 폴더 반환`);
                      sendResponse({ success: true, folders: newData.allBookmarkFolders });
                  } else {
                      logDebug("getTopLevelFolders: 북마크 폴더 로드 실패");
                      sendResponse({ success: false, error: "북마크 폴더를 찾을 수 없습니다. 브라우저에 북마크가 있는지 확인해주세요." });
                  }
              }
          } catch (e) {
              logDebug("getTopLevelFolders 오류:", e);
              sendResponse({ success: false, error: e.message });
          }
      })();
      return true; // 비동기 응답을 위해 true 반환
    }
    
    // Favicon 가져오기 (CORS 문제 해결용)
    if (request.action === "fetchFavicon") {
      if (!request.url || !request.cacheKey) {
        sendResponse({ success: false, error: "URL 또는 캐시 키가 누락됨" });
        return true;
      }
      
      try {
        // background script에서는 CORS 제한이 없으므로 직접 fetch 가능
        fetch(request.url)
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.blob();
          })
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result;
              const obj = {};
              obj[request.cacheKey] = dataUrl;
              
              // 로컬 스토리지에 캐시
              chrome.storage.local.set(obj, () => {
                if (chrome.runtime.lastError) {
                  logDebug("Favicon 캐시 저장 실패:", chrome.runtime.lastError);
                  sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                  logDebug("Favicon 캐시 저장 성공:", request.cacheKey);
                  sendResponse({ success: true, dataUrl: dataUrl });
                }
              });
            };
            reader.onerror = () => {
              sendResponse({ success: false, error: "FileReader 오류" });
            };
            reader.readAsDataURL(blob);
          })
          .catch(error => {
            logDebug("Favicon fetch 실패:", error);
            sendResponse({ success: false, error: error.message });
          });
      } catch (error) {
        logDebug("Favicon fetch 처리 중 예외:", error);
        sendResponse({ success: false, error: error.message });
      }
      
      return true; // 비동기 응답을 위해 true 반환
    }
    
    // 북마크 초기 가져오기
    if (request.action === "importInitialBookmarks") {
      if (!request.sourceFolderIds || !Array.isArray(request.sourceFolderIds) || request.sourceFolderIds.length === 0) {
        sendResponse({ success: false, error: "가져올 폴더 ID가 올바르지 않습니다." });
        return true;
      }
      
      // BookStaxx 폴더가 없으면 초기화
      if (!bookStaxxFolderId) {
        initBookStaxxFolder()
          .then(folderId => {
            bookStaxxFolderId = folderId;
            isInitialized = true;
            importBookmarks(request.sourceFolderIds, sendResponse);
          })
          .catch(error => {
            sendResponse({ success: false, error: "BookStaxx 폴더 초기화 실패: " + error.message });
          });
      } else {
        // 이미 초기화된 경우 바로 가져오기 실행
        importBookmarks(request.sourceFolderIds, sendResponse);
      }
      
      return true; // 비동기 응답을 위해 true 반환
    }
    
    // 북마크 가져오기 내부 함수
    function importBookmarks(sourceFolderIds, sendResponse) {
      let importedCount = 0;
      let processedFolders = 0;
      let totalBookmarks = 0;
      
      // 각 소스 폴더를 처리
      for (const folderId of sourceFolderIds) {
        chrome.bookmarks.getChildren(folderId, function(bookmarks) {
          if (chrome.runtime.lastError) {
            console.error("북마크 가져오기 실패:", chrome.runtime.lastError);
            processedFolders++;
            checkCompletion();
            return;
          }
          
          // URL이 있는 북마크 카운트
          const bookmarksToImport = bookmarks.filter(bookmark => bookmark.url);
          totalBookmarks += bookmarksToImport.length;
          
          // 북마크 생성 카운터
          let createdBookmarks = 0;
          
          // 폴더에 북마크가 없는 경우 바로 처리 완료로 표시
          if (bookmarksToImport.length === 0) {
            processedFolders++;
            checkCompletion();
            return;
          }
          
          // 각 북마크를 처리
          for (const bookmark of bookmarksToImport) {
            // 북마크를 BookStaxx 폴더에 복사
            chrome.bookmarks.create({
              parentId: bookStaxxFolderId,
              title: bookmark.title,
              url: bookmark.url
            }, function(newBookmark) {
              if (chrome.runtime.lastError) {
                console.error("북마크 생성 실패:", chrome.runtime.lastError, bookmark.url);
              } else {
                importedCount++;
              }
              
              createdBookmarks++;
              
              // 현재 폴더의 모든 북마크 처리 완료 시
              if (createdBookmarks === bookmarksToImport.length) {
                processedFolders++;
                checkCompletion();
              }
            });
          }
        });
      }
      
      // 모든 폴더 처리 완료 확인 함수
      function checkCompletion() {
        if (processedFolders === sourceFolderIds.length) {
          sendResponse({ 
            success: true,
            count: importedCount
          });
        }
      }
    }
    
  } catch (error) {
    console.error("메시지 처리 중 오류:", error);
    try {
      sendResponse({ success: false, error: "메시지 처리 중 오류: " + (error.message || "알 수 없는 오류") });
    } catch (responseError) {
      console.error("응답 전송 중 오류:", responseError);
    }
    return true;
  }
});

// 북마크 처리 함수
function processBookmarks(bookmarkTree) {
  const result = [];
  
  function traverse(nodes) {
    for (const node of nodes) {
      // BookStaxx 폴더인지 확인
      if (node.id === bookStaxxFolderId) {
        // BookStaxx 폴더인 경우 처리
        const folder = {
          id: node.id,
          title: node.title || "북마크",
          type: "folder",
          children: []
        };
        
        // 자식 노드(북마크) 처리
        if (node.children) {
          for (const child of node.children) {
            if (child.url) {
              // 북마크인 경우
              folder.children.push({
                id: child.id,
                title: child.title || "",
                url: child.url,
                type: "bookmark"
              });
            } else if (child.children) {
              // 하위 폴더인 경우
              const subFolder = {
                id: child.id,
                title: child.title || "폴더",
                type: "folder",
                children: []
              };
              
              // 하위 폴더 내 북마크 처리
              for (const grandChild of child.children) {
                if (grandChild.url) {
                  subFolder.children.push({
                    id: grandChild.id,
                    title: grandChild.title || "",
                    url: grandChild.url,
                    type: "bookmark"
                  });
                }
              }
              
              // 북마크가 있는 폴더만 추가
              if (subFolder.children.length > 0) {
                folder.children.push(subFolder);
              }
            }
          }
        }
        
        // BookStaxx 폴더를 결과에 추가
        result.push(folder);
        
        // BookStaxx 폴더를 찾았으므로 더 이상 검색하지 않음
        return;
      } else if (node.children) {
        // 다른 폴더인 경우 자식 노드 검색
        traverse(node.children);
      }
    }
  }
  
  traverse(bookmarkTree);
  
  // BookStaxx 폴더가 비어있거나 없는 경우 빈 폴더 생성
  if (result.length === 0 && bookStaxxFolderId) {
    result.push({
      id: bookStaxxFolderId,
      title: BOOKSTAXX_FOLDER_NAME,
      type: "folder",
      children: []
    });
  }
  
  return result;
}

// 북마크를 특정 폴더에 추가하는 헬퍼 함수
function addBookmarkToFolder(title, url, callback) {
  // URL이 유효한지 확인
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    callback({
      success: false,
      error: "유효하지 않은 URL입니다."
    });
    return;
  }
  
  // 제목이 없으면 URL에서 도메인 추출
  if (!title || title.trim() === '') {
    title = "";
  }
  
  // 북마크 중복 체크
  chrome.bookmarks.search({ url: url }, (results) => {
    if (chrome.runtime.lastError) {
      console.error("북마크 검색 실패:", chrome.runtime.lastError);
      callback({
        success: false,
        error: chrome.runtime.lastError.message
      });
      return;
    }

    let isInBookStaxxFolder = false;
    
    // BookStaxx 폴더에 이미 있는지 확인
    for (const bookmark of results) {
      if (bookmark.parentId === bookStaxxFolderId) {
        isInBookStaxxFolder = true;
        break;
      }
    }
    
    if (isInBookStaxxFolder) {
      // 이미 BookStaxx 폴더에 있는 경우
      callback({
        success: true,
        message: "이미 북마크에 추가되어 있습니다."
      });
    } else {
      // 새 북마크 추가
      chrome.bookmarks.create({
        parentId: bookStaxxFolderId,
        title: title,
        url: url
      }, (newBookmark) => {
        if (chrome.runtime.lastError) {
          callback({
            success: false,
            error: chrome.runtime.lastError.message
          });
        } else {
          callback({
            success: true,
            bookmark: newBookmark
          });
        }
      });
    }
  });
}

// 매시간마다 컨텍스트 무효화 추적 정보 정리
setInterval(() => {
    const now = Date.now();
    const expiredKeys = [];
    
    // 24시간 이상 된 항목 찾기
    for (const key in invalidatedContexts) {
        const context = invalidatedContexts[key];
        if (now - context.timestamp > 24 * 60 * 60 * 1000) {
            expiredKeys.push(key);
        }
    }
    
    // 만료된 항목 삭제
    expiredKeys.forEach(key => {
        delete invalidatedContexts[key];
    });
    
    if (expiredKeys.length > 0) {
        logDebug(`${expiredKeys.length}개의 만료된 컨텍스트 추적 항목 정리됨`);
    }
}, 60 * 60 * 1000); // 1시간마다 실행

// 확장 프로그램 시작 로그
if (DEBUG_MODE) {
  logDebug("BookStaxx 백그라운드 스크립트 로드됨", {
    version: chrome.runtime.getManifest().version
  });
}

// 서비스 워커 시작 시 초기화 즉시 실행
initialize().catch(error => {
  if (DEBUG_MODE) console.error("초기 초기화 실패:", error);
  // 실패 시 30초 후 재시도
  setTimeout(initialize, 30000);
});

// 컨텐츠 스크립트에 설정 가져오기 메시지 리스너 추가
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message && message.action === "getSettings") {
    // 모든 설정 가져오기
    chrome.storage.sync.get(null, function(result) {
      // 기본값과 병합
      const settings = { ...DEFAULT_SETTINGS, ...result };
      if (DEBUG_MODE) console.log("설정 요청에 응답:", settings);
      sendResponse({ success: true, settings: settings });
    });
    return true; // 비동기 응답을 위해 true 반환
  }
});

// content.js가 로드될 때 초기화 리스너 추가
chrome.runtime.onInstalled.addListener(() => {
  // 확장 프로그램이 설치될 때 content.js 재로드를 위한 업데이트 알림
  chrome.tabs.query({}, function(tabs) {
    for (let tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, { action: "extensionReloaded" });
      } catch (e) {
        // 일부 탭은 접근이 불가능할 수 있으므로 오류 무시
      }
    }
  });
}); 