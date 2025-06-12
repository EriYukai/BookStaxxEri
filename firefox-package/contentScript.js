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

// 전역 변수
let bookmarkBar = null;
let isShiftKeyDown = false;
let isDragging = false;
let initialX, initialY, initialLeft, initialTop;
let theme = 'light'; // 기본 테마는 라이트

// 북마크 바 생성
function createBookmarkBar() {
  // 이미 존재하면 제거
  removeBookmarkBar();
  
  // 새로운 북마크 바 생성
  bookmarkBar = document.createElement('div');
  bookmarkBar.id = 'bookstaxx-bookmark-bar';
  bookmarkBar.className = `bookstaxx-bookmark-bar bookstaxx-${theme}-theme`;
  
  // 위치 설정 (기본값)
  bookmarkBar.style.left = '20px';
  bookmarkBar.style.top = '20px';
  
  // 저장된 위치 가져오기
  chrome.storage.local.get(['position', 'theme'], (result) => {
    if (result.position) {
      bookmarkBar.style.left = result.position.left;
      bookmarkBar.style.top = result.position.top;
    }
    
    if (result.theme) {
      theme = result.theme;
      bookmarkBar.className = `bookstaxx-bookmark-bar bookstaxx-${theme}-theme`;
    }
  });
  
  // 컨테이너 생성
  const container = document.createElement('div');
  container.className = 'bookstaxx-container';
  
  // 헤더 섹션 생성
  const header = document.createElement('div');
  header.className = 'bookstaxx-header';
  header.style.cursor = 'move';
  
  // 헤더에 드래그 이벤트 추가
  header.addEventListener('mousedown', startDrag);
  
  // 제목 요소 생성
  const title = document.createElement('div');
  title.className = 'bookstaxx-title';
  title.textContent = 'BookStaxx';
  header.appendChild(title);
  
  // 검색 컨테이너 생성
  const searchContainer = document.createElement('div');
  searchContainer.className = 'bookstaxx-search-container';
  
  // 검색 입력 요소 생성
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'bookstaxx-search-input';
  searchInput.placeholder = chrome.i18n.getMessage('searchPlaceholder') || 'Search bookmarks...';
  searchInput.addEventListener('click', (e) => e.stopPropagation());
  searchInput.addEventListener('input', handleSearch);
  searchContainer.appendChild(searchInput);
  
  // 북마크 컨테이너 생성
  const bookmarkContainer = document.createElement('div');
  bookmarkContainer.className = 'bookstaxx-bookmark-container';
  
  // 로딩 아이콘과 메시지 생성
  const loadingContainer = document.createElement('div');
  loadingContainer.className = 'bookstaxx-loading';
  
  // 로딩 아이콘 생성
  const loadingIcon = document.createElement('div');
  loadingIcon.className = 'bookstaxx-loading-icon';
  loadingContainer.appendChild(loadingIcon);
  
  // 로딩 텍스트 생성
  const loadingText = document.createElement('div');
  loadingText.className = 'bookstaxx-loading-text';
  loadingText.textContent = chrome.i18n.getMessage('loadingBookmarks') || 'Loading bookmarks...';
  loadingContainer.appendChild(loadingText);
  
  // 컨테이너에 로딩 메시지 추가
  bookmarkContainer.appendChild(loadingContainer);
  
  // 요소 조합
  container.appendChild(header);
  container.appendChild(searchContainer);
  container.appendChild(bookmarkContainer);
  bookmarkBar.appendChild(container);
  
  // 문서에 추가
  document.body.appendChild(bookmarkBar);
  
  // 북마크 데이터 로드
  loadBookmarks(bookmarkContainer);
  
  // 북마크 바 외부 클릭 감지 설정
  document.addEventListener('click', handleOutsideClick);
  
  // 검색 입력에 포커스
  setTimeout(() => {
    searchInput.focus();
  }, 300);
  
  // 북마크 바 표시 (애니메이션 효과)
  setTimeout(() => {
    bookmarkBar.classList.add('visible');
  }, 10);
  
  // 뒤로가기 버튼 생성
  createActionButton('back', (e) => {
    e.stopPropagation();
    window.history.back();
  });
  
  // 북마크 추가 버튼 생성
  createActionButton('add', (e) => {
    e.stopPropagation();
    addCurrentPageToBookmarks();
  });
  
  return bookmarkBar;
}

// 북마크 바 제거
function removeBookmarkBar() {
  if (bookmarkBar && bookmarkBar.parentNode) {
    document.removeEventListener('click', handleOutsideClick);
    bookmarkBar.parentNode.removeChild(bookmarkBar);
    bookmarkBar = null;
  }
}

// 북마크 데이터 로드
function loadBookmarks(container) {
  chrome.runtime.sendMessage({ action: 'getBookmarks' }, (response) => {
    // 컨테이너 비우기
    container.innerHTML = '';
    
    if (!response || !response.success) {
      const errorMessage = document.createElement('div');
      errorMessage.className = 'bookstaxx-error';
      errorMessage.textContent = chrome.i18n.getMessage('errorLoadingBookmarks') || 'Unable to load bookmarks. Please reload the extension.';
      container.appendChild(errorMessage);
      return;
    }
    
    const bookmarks = response.bookmarks;
    
    if (!bookmarks || bookmarks.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'bookstaxx-loading';
      emptyMessage.textContent = chrome.i18n.getMessage('noBookmarks') || 'No bookmarks available.';
      container.appendChild(emptyMessage);
      return;
    }
    
    // 북마크 렌더링
    renderBookmarks(bookmarks, container);
  });
}

// 북마크 렌더링
function renderBookmarks(bookmarks, container) {
  bookmarks.forEach(bookmark => {
    if (bookmark.type === 'folder') {
      // 폴더 렌더링
      const folderElement = createFolderElement(bookmark);
      container.appendChild(folderElement);
    } else if (bookmark.type === 'bookmark') {
      // 북마크 렌더링
      const bookmarkElement = createBookmarkElement(bookmark);
      container.appendChild(bookmarkElement);
    }
  });
}

// 폴더 요소 생성
function createFolderElement(folder) {
  const folderElement = document.createElement('div');
  folderElement.className = 'bookstaxx-folder';
  folderElement.dataset.id = folder.id;
  
  // 폴더 헤더
  const folderHeader = document.createElement('div');
  folderHeader.className = 'bookstaxx-folder-header';
  
  // 폴더 아이콘
  const folderIcon = document.createElement('div');
  folderIcon.className = 'bookstaxx-folder-icon';
  
  // 폴더 제목
  const folderTitle = document.createElement('div');
  folderTitle.className = 'bookstaxx-folder-title';
  folderTitle.textContent = folder.title;
  
  // 폴더 컨텐츠 (자식 요소들)
  const folderContent = document.createElement('div');
  folderContent.className = 'bookstaxx-folder-content';
  
  // 폴더 자식 요소 렌더링
  if (folder.children && folder.children.length > 0) {
    renderBookmarks(folder.children, folderContent);
  }
  
  // 폴더 토글 이벤트
  folderHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    folderElement.classList.toggle('bookstaxx-folder-expanded');
  });
  
  // 요소 조합
  folderHeader.appendChild(folderIcon);
  folderHeader.appendChild(folderTitle);
  folderElement.appendChild(folderHeader);
  folderElement.appendChild(folderContent);
  
  return folderElement;
}

// 북마크 요소 생성
function createBookmarkElement(bookmark) {
  const bookmarkElement = document.createElement('div');
  bookmarkElement.className = 'bookstaxx-bookmark';
  bookmarkElement.dataset.id = bookmark.id;
  bookmarkElement.dataset.url = bookmark.url;
  
  // 파비콘 컨테이너
  const faviconContainer = document.createElement('div');
  faviconContainer.className = 'bookstaxx-favicon-container';
  
  // 파비콘 (실제 이미지)
  const favicon = document.createElement('img');
  favicon.className = 'bookstaxx-favicon';
  favicon.src = `chrome://favicon/size/16@1x/${bookmark.url}`;
  favicon.onerror = () => {
    favicon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  };
  
  // 북마크 제목
  const bookmarkTitle = document.createElement('div');
  bookmarkTitle.className = 'bookstaxx-bookmark-title';
  bookmarkTitle.textContent = bookmark.title || new URL(bookmark.url).hostname;
  
  // 북마크 클릭 이벤트
  bookmarkElement.addEventListener('click', (e) => {
    e.stopPropagation();
    openBookmark(bookmark.url);
  });
  
  // 요소 조합
  faviconContainer.appendChild(favicon);
  bookmarkElement.appendChild(faviconContainer);
  bookmarkElement.appendChild(bookmarkTitle);
  
  return bookmarkElement;
}

// 북마크 열기
function openBookmark(url) {
  try {
    // 설정을 가져와서 북마크 열기 방식 결정 - 직접 조회
    chrome.storage.sync.get(['bookmarkOpenMode'], function(result) {
      // 명확한 값 체크
      const openMode = result.bookmarkOpenMode;
      console.log("북마크 열기 방식 직접 조회 결과:", openMode, "타입:", typeof openMode);
      
      // 명시적으로 openInNewTab 결정 - default는 새 탭
      let openInNewTab = true;
      
      // 정확히 'current'일 때만 false로 설정
      if (openMode === 'current') {
        openInNewTab = false;
        console.log("현재 탭에서 열기로 설정됨 (current)");
      } else {
        console.log("새 탭에서 열기로 설정됨 (new 또는 기본값)");
      }
      
      console.log(`URL ${url}을(를) ${openInNewTab ? '새 탭에서' : '현재 탭에서'} 열기로 결정`);
      
      // 메시지 전송 - 디버깅 정보 추가
      const message = {
        action: 'openBookmark',
        url: url,
        openInNewTab: openInNewTab,
        debug: { settingValue: openMode }
      };
      
      console.log("background.js로 전송할 메시지:", message);
      
      // 설정에 따라 북마크 열기 요청
      chrome.runtime.sendMessage(message, (response) => {
        console.log("북마크 열기 응답:", response);
        
        if (response && response.success) {
          removeBookmarkBar();
        }
      });
    });
  } catch (error) {
    console.error("북마크 열기 중 오류 발생:", error);
  }
}

// 검색 처리
function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  const bookmarkItems = document.querySelectorAll('.bookstaxx-bookmark');
  const folderItems = document.querySelectorAll('.bookstaxx-folder');
  
  if (!query) {
    // 검색어가 없으면 모든 항목 표시
    bookmarkItems.forEach(item => item.style.display = '');
    folderItems.forEach(folder => {
      folder.style.display = '';
      folder.classList.remove('bookstaxx-folder-expanded');
    });
    return;
  }
  
  // 검색 로직
  bookmarkItems.forEach(item => {
    const title = item.querySelector('.bookstaxx-bookmark-title').textContent.toLowerCase();
    const url = item.dataset.url.toLowerCase();
    
    if (title.includes(query) || url.includes(query)) {
      item.style.display = '';
      
      // 상위 폴더 모두 펼치기
      let parent = item.parentElement;
      while (parent && !parent.classList.contains('bookstaxx-bookmark-container')) {
        if (parent.classList.contains('bookstaxx-folder-content')) {
          parent.parentElement.classList.add('bookstaxx-folder-expanded');
          parent.parentElement.style.display = '';
        }
        parent = parent.parentElement;
      }
    } else {
      item.style.display = 'none';
    }
  });
  
  // 빈 폴더 숨기기
  folderItems.forEach(folder => {
    const content = folder.querySelector('.bookstaxx-folder-content');
    const visibleItems = content.querySelectorAll('.bookstaxx-bookmark[style=""], .bookstaxx-folder[style=""]');
    
    if (visibleItems.length === 0) {
      folder.style.display = 'none';
    } else {
      folder.style.display = '';
      folder.classList.add('bookstaxx-folder-expanded');
    }
  });
}

// 바깥쪽 클릭 처리
function handleOutsideClick(e) {
  if (bookmarkBar && !bookmarkBar.contains(e.target)) {
    removeBookmarkBar();
  }
}

// 드래그 시작
function startDrag(e) {
  if (e.target.tagName.toLowerCase() === 'input') {
    return; // 입력 필드에서는 드래그 금지
  }
  
  e.preventDefault();
  isDragging = true;
  initialX = e.clientX;
  initialY = e.clientY;
  
  const rect = bookmarkBar.getBoundingClientRect();
  initialLeft = rect.left;
  initialTop = rect.top;
  
  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', stopDrag);
}

// 드래그 처리
function handleDrag(e) {
  if (!isDragging) return;
  
  e.preventDefault();
  
  const dx = e.clientX - initialX;
  const dy = e.clientY - initialY;
  
  const newLeft = initialLeft + dx;
  const newTop = initialTop + dy;
  
  // 화면 경계 확인
  const maxX = window.innerWidth - bookmarkBar.offsetWidth;
  const maxY = window.innerHeight - bookmarkBar.offsetHeight;
  
  bookmarkBar.style.left = `${Math.max(0, Math.min(maxX, newLeft))}px`;
  bookmarkBar.style.top = `${Math.max(0, Math.min(maxY, newTop))}px`;
}

// 드래그 중지
function stopDrag() {
  if (!isDragging) return;
  
  isDragging = false;
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('mouseup', stopDrag);
  
  // 위치 저장
  chrome.storage.local.set({
    position: {
      left: bookmarkBar.style.left,
      top: bookmarkBar.style.top
    }
  });
}

// 키보드 이벤트 리스너
document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') {
    isShiftKeyDown = true;
  }
  
  // Shift + B 북마크 바 토글
  if (isShiftKeyDown && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggleBookmarkBar();
  }
  
  // ESC 키로 북마크 바 닫기
  if (e.key === 'Escape' && bookmarkBar) {
    removeBookmarkBar();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') {
    isShiftKeyDown = false;
  }
});

// 북마크 바 토글
function toggleBookmarkBar() {
  if (bookmarkBar) {
    removeBookmarkBar();
  } else {
    createBookmarkBar();
  }
}

// 테마 변경
function changeTheme(newTheme) {
  theme = newTheme;
  if (bookmarkBar) {
    bookmarkBar.className = `bookstaxx-bookmark-bar bookstaxx-${theme}-theme`;
  }
  chrome.storage.local.set({ theme });
}

// 확장 프로그램 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleBookmarks') {
    toggleBookmarkBar();
    sendResponse({ success: true });
  }
  
  if (request.action === 'changeTheme') {
    changeTheme(request.theme);
    sendResponse({ success: true });
  }
  
  if (request.action === 'showBookmarkBar') {
    createBookmarkBar();
    sendResponse({ success: true });
  }
  
  return true;
});

// 자동으로 다크 모드 감지
function detectColorScheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    changeTheme('dark');
  } else {
    changeTheme('light');
  }
}

// 초기화
detectColorScheme();

// 다크 모드 변경 감지
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', detectColorScheme);

// 액션 버튼 생성 (뒤로가기, 북마크 추가)
function createActionButton(type, clickHandler) {
  const button = document.createElement('div');
  button.className = `bookstaxx-action-button bookstaxx-${type}-button`;
  
  // 클릭 위치를 기준으로 버튼 배치
  const offset = type === 'back' ? -80 : 80; // 왼쪽/오른쪽 간격 조정
  
  // 위치 설정
  button.style.left = `${clickPosition.x + offset}px`;
  button.style.top = `${clickPosition.y}px`;
  
  // 아이콘 설정
  const icon = document.createElement('svg');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  
  // 아이콘 타입에 따라 경로 설정
  if (type === 'back') {
    icon.innerHTML = '<path d="M19 12H5M12 19l-7-7 7-7"/>';
  } else if (type === 'add') {
    icon.innerHTML = '<path d="M12 5v14M5 12h14"/>';
  }
  
  button.appendChild(icon);
  button.addEventListener('click', clickHandler);
  
  // 문서에 추가
  document.body.appendChild(button);
  
  return button;
}

// 현재 페이지를 북마크에 추가
function addCurrentPageToBookmarks() {
  // BookStaxx 폴더에 현재 페이지 추가
  chrome.runtime.sendMessage({ 
    action: 'addBookmark',
    title: document.title,
    url: window.location.href
  }, (response) => {
    if (response && response.success) {
      // 성공 메시지 표시
      showNotification(chrome.i18n.getMessage('bookmarkAdded') || 'Bookmark added successfully.', 'success');
    } else {
      // 실패 메시지 표시
      showNotification(chrome.i18n.getMessage('bookmarkAddFailed') || 'Failed to add bookmark.', 'error');
    }
  });
}

// 알림 메시지 표시
function showNotification(message, type = 'info') {
  // 기존 알림 제거
  const existingNotification = document.querySelector('.bookstaxx-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // 새 알림 생성
  const notification = document.createElement('div');
  notification.className = `bookstaxx-notification bookstaxx-notification-${type}`;
  notification.textContent = message;
  
  // 스타일 설정
  Object.assign(notification.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: '2147483647',
    opacity: '0',
    transition: 'transform 0.3s ease, opacity 0.3s ease'
  });
  
  // 타입에 따라 스타일 조정
  if (type === 'success') {
    notification.style.backgroundColor = '#34c759';
    notification.style.color = 'white';
  } else if (type === 'error') {
    notification.style.backgroundColor = '#ff3b30';
    notification.style.color = 'white';
  } else {
    notification.style.backgroundColor = '#007aff';
    notification.style.color = 'white';
  }
  
  // 문서에 추가
  document.body.appendChild(notification);
  
  // 애니메이션 표시
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(-50%) translateY(0)';
  }, 10);
  
  // 3초 후 제거
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
} 