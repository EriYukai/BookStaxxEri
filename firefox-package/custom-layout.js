const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh_CN', 'es', 'fr', 'de', 'ru', 'pt_BR', 'hi'];
let messagesToUse = null; // 전역 변수로 변경

async function applyLanguageForCustomLayout(lang) {
    let targetLang = lang;

    if (lang === 'auto' || !lang) {
        targetLang = chrome.i18n.getUILanguage().split('-')[0];
        if (!SUPPORTED_LANGUAGES.includes(targetLang)) {
            targetLang = 'en'; 
        }
    }
    console.log(`Custom Layout UI 언어 적용: ${targetLang} (선택값: ${lang})`);

    try {
        const result = await new Promise(resolve => chrome.storage.local.get([`i18n_${targetLang}`, 'i18n_en'], resolve));
        if (result[`i18n_${targetLang}`]) {
            messagesToUse = result[`i18n_${targetLang}`];
            console.log(`${targetLang} 언어 메시지 로드됨`);
        } else if (result.i18n_en) {
            messagesToUse = result.i18n_en;
            targetLang = 'en';
            console.log(`기본 영어 메시지로 대체됨`);
        } else {
            console.error('CustomLayout: Required language messages not found.');
            return; // 메시지 없으면 UI 업데이트 불가
        }
    } catch (error) {
        console.error('CustomLayout: Error loading messages from local storage:', error);
        return;
    }

    // 이제 모든 UI 요소에 언어 적용
    applyMessagesToUI();
    return targetLang;
}

// UI 요소에 메시지 적용하는 함수 분리
function applyMessagesToUI() {
    if (!messagesToUse) {
        console.error('메시지가 로드되지 않아 UI를 업데이트할 수 없습니다.');
        return;
    }
    
    console.log('UI 요소에 메시지 적용 시작');
    
    // 제목 요소 업데이트
    const titleElement = document.querySelector('title');
    if (titleElement && messagesToUse['customLayoutEditorTitle']) {
        titleElement.textContent = messagesToUse['customLayoutEditorTitle'].message;
        console.log('제목 업데이트: ' + messagesToUse['customLayoutEditorTitle'].message);
    }
    
    // 헤더 업데이트
    const headerElement = document.querySelector('h1[data-i18n="customLayoutEditorHeader"]');
    if (headerElement && messagesToUse['customLayoutEditorHeader']) {
        headerElement.textContent = messagesToUse['customLayoutEditorHeader'].message;
        console.log('헤더 업데이트: ' + messagesToUse['customLayoutEditorHeader'].message);
    }
    
    // 버튼 업데이트
    const saveButton = document.getElementById('saveLayoutButton');
    if (saveButton && messagesToUse['saveLayoutButton']) {
        saveButton.textContent = messagesToUse['saveLayoutButton'].message;
        console.log('저장 버튼 업데이트: ' + messagesToUse['saveLayoutButton'].message);
    }
    
    const resetButton = document.getElementById('resetLayoutButton');
    if (resetButton && messagesToUse['resetLayoutButton']) {
        resetButton.textContent = messagesToUse['resetLayoutButton'].message;
        console.log('초기화 버튼 업데이트: ' + messagesToUse['resetLayoutButton'].message);
    }
    
    // 다른 모든 data-i18n 속성을 가진 요소 업데이트
    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (messagesToUse[key] && messagesToUse[key].message) {
            elem.textContent = messagesToUse[key].message;
            console.log(`${key} 요소 업데이트: ${messagesToUse[key].message}`);
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM이 로드되었습니다. 언어 설정 적용 및 UI 초기화를 시작합니다.');
    
    const editorContainer = document.getElementById('editorContainer');
    const saveLayoutButton = document.getElementById('saveLayoutButton');
    const resetLayoutButton = document.getElementById('resetLayoutButton');
    const itemCount = 100;
    let layoutItems = [];
    let draggingItem = null;
    let offsetX, offsetY;

    // 사용자 창 크기에 맞춘 레이아웃 영역 계산
    function calculateLayoutDimensions() {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const windowAspectRatio = windowWidth / windowHeight;
        
        console.log(`Window dimensions: ${windowWidth}x${windowHeight}, aspect ratio: ${windowAspectRatio.toFixed(2)}`);
        
        // 전체 윈도우 크기 사용
        let containerWidth = windowWidth;
        let containerHeight = windowHeight - 120; // UI 요소 여백 고려
        
        // 레이아웃 영역을 컨테이너 크기와 동일하게 설정
        let layoutWidth = containerWidth;
        let layoutHeight = containerHeight;
        
        return {
            containerWidth,
            containerHeight,
            layoutWidth,
            layoutHeight
        };
    }

    // 초기 아이템 생성 및 배치
    function initializeItems() {
        editorContainer.innerHTML = ''; // 기존 아이템 제거
        layoutItems = [];
        
        // 컨테이너와 레이아웃 크기 계산
        const dimensions = calculateLayoutDimensions();
        
        // 컨테이너 크기 설정
        const container = document.querySelector('.editor-container');
        container.style.width = `${dimensions.containerWidth}px`;
        container.style.height = `${dimensions.containerHeight}px`;
        
        // 레이아웃 영역 크기 설정
        editorContainer.style.width = `${dimensions.layoutWidth}px`;
        editorContainer.style.height = `${dimensions.layoutHeight}px`;
        
        console.log(`Container: ${dimensions.containerWidth}x${dimensions.containerHeight}`);
        console.log(`Layout area: ${dimensions.layoutWidth}x${dimensions.layoutHeight}`);
        
        // 컨테이너 크기가 제대로 적용될 때까지 대기
        setTimeout(() => {
            const itemSize = 40; // .layout-item의 width/height
            const padding = 10; // 가장자리 여백

            for (let i = 1; i <= itemCount; i++) {
                const item = document.createElement('div');
                item.classList.add('layout-item');
                item.textContent = i;
                item.dataset.id = i;
                
                // 초기 무작위 위치 (레이아웃 영역 내에서)
                let x = Math.random() * (dimensions.layoutWidth - itemSize - 2 * padding) + padding;
                let y = Math.random() * (dimensions.layoutHeight - itemSize - 2 * padding) + padding;
                
                item.style.left = `${x}px`;
                item.style.top = `${y}px`;
                
                editorContainer.appendChild(item);
                layoutItems.push({ id: i, element: item, x: x, y: y });

                item.addEventListener('mousedown', startDrag);
            }
        }, 100); // 100ms 지연
    }

    function startDrag(e) {
        draggingItem = e.target;
        // 마우스 포인터와 아이템 좌상단 모서리 간의 오프셋 계산
        offsetX = e.clientX - draggingItem.getBoundingClientRect().left;
        offsetY = e.clientY - draggingItem.getBoundingClientRect().top;
        draggingItem.style.cursor = 'grabbing';
        draggingItem.style.zIndex = '1000'; // 드래그 중인 아이템을 최상단으로

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }

    function drag(e) {
        if (!draggingItem) return;
        e.preventDefault(); // 페이지 스크롤 등 기본 동작 방지

        // 컨테이너 경계 내부에서의 새 위치 계산
        const containerRect = editorContainer.getBoundingClientRect();
        let newX = e.clientX - containerRect.left - offsetX;
        let newY = e.clientY - containerRect.top - offsetY;

        // 경계 제한 - offsetWidth/offsetHeight 사용
        const itemSize = draggingItem.offsetWidth; // 실제 아이템 크기 사용
        newX = Math.max(0, Math.min(newX, editorContainer.offsetWidth - itemSize));
        newY = Math.max(0, Math.min(newY, editorContainer.offsetHeight - itemSize));

        draggingItem.style.left = `${newX}px`;
        draggingItem.style.top = `${newY}px`;
    }

    function stopDrag() {
        if (!draggingItem) return;
        const itemId = parseInt(draggingItem.dataset.id);
        const currentItem = layoutItems.find(it => it.id === itemId);
        if (currentItem) {
            currentItem.x = parseFloat(draggingItem.style.left);
            currentItem.y = parseFloat(draggingItem.style.top);
        }
        
        draggingItem.style.cursor = 'grab';
        draggingItem.style.zIndex = ''; // 원래 z-index로 복원 (CSS에 정의된 값)
        draggingItem = null;

        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
    }

    // 레이아웃 저장 로직 (chrome.storage.local 사용) - 비율로 저장
    saveLayoutButton.addEventListener('click', () => {
        const containerWidth = editorContainer.offsetWidth;
        const containerHeight = editorContainer.offsetHeight;
        
        const layoutToSave = layoutItems.map(item => {
            const x = parseFloat(item.element.style.left);
            const y = parseFloat(item.element.style.top);
            return {
                id: item.id,
                // 상대적 비율로 저장 (0-1 범위)
                xRatio: x / containerWidth,
                yRatio: y / containerHeight
            };
        });
        let msgKeySaveSuccess = 'layoutSaveSuccess';
        let msgKeySaveError = 'layoutSaveError';

        chrome.storage.local.set({ 'customBookmarkLayout': layoutToSave }, () => {
            let alertMessage;
            if (chrome.runtime.lastError) {
                alertMessage = (messagesToUse && messagesToUse[msgKeySaveError]) ? messagesToUse[msgKeySaveError].message.replace('{error}', chrome.runtime.lastError.message) : (chrome.i18n.getMessage('layoutSaveError', [chrome.runtime.lastError.message]) || 'Error saving layout: ' + chrome.runtime.lastError.message);
            } else {
                alertMessage = (messagesToUse && messagesToUse[msgKeySaveSuccess]) ? messagesToUse[msgKeySaveSuccess].message : (chrome.i18n.getMessage('layoutSaveSuccess') || 'Layout saved successfully!');
            }
            alert(alertMessage);
        });
    });

    // 레이아웃 초기화 로직
    resetLayoutButton.addEventListener('click', () => {
        let confirmMessage = (messagesToUse && messagesToUse['confirmResetLayout']) ? messagesToUse['confirmResetLayout'].message : (chrome.i18n.getMessage('confirmResetLayout') || 'Are you sure you want to reset all item positions?');
        if (confirm(confirmMessage)) {
            initializeItems(); // 아이템 재생성 및 기본 위치로
            // 저장된 커스텀 레이아웃도 삭제할 수 있음 (선택 사항)
            // chrome.storage.local.remove('customBookmarkLayout', () => {
            //     alert('레이아웃이 초기화되었습니다.');
            // });
        }
    });

    // 저장된 레이아웃 불러오기 - 비율 기반
    function loadLayout() {
        chrome.storage.local.get('customBookmarkLayout', (result) => {
            if (chrome.runtime.lastError) {
                console.error('저장된 레이아웃 로드 중 오류:', chrome.runtime.lastError);
                initializeItems(); // 오류 시 기본 아이템 생성
                return;
            }
            const savedLayout = result.customBookmarkLayout;
            if (savedLayout && Array.isArray(savedLayout) && savedLayout.length === itemCount) {
                // 컨테이너와 레이아웃 크기 계산
                const dimensions = calculateLayoutDimensions();
                
                // 컨테이너 크기 설정
                const container = document.querySelector('.editor-container');
                container.style.width = `${dimensions.containerWidth}px`;
                container.style.height = `${dimensions.containerHeight}px`;
                
                // 레이아웃 영역 크기 설정
                editorContainer.style.width = `${dimensions.layoutWidth}px`;
                editorContainer.style.height = `${dimensions.layoutHeight}px`;
                
                // 컨테이너 크기가 제대로 적용될 때까지 대기
                setTimeout(() => {
                    const containerWidth = editorContainer.offsetWidth;
                    const containerHeight = editorContainer.offsetHeight;
                    
                    editorContainer.innerHTML = ''; // 기존 아이템 제거
                    layoutItems = [];
                    
                    savedLayout.forEach(savedItem => {
                        const item = document.createElement('div');
                        item.classList.add('layout-item');
                        item.textContent = savedItem.id;
                        item.dataset.id = savedItem.id;
                        
                        // 비율 기반으로 위치 복원
                        let x, y;
                        if (savedItem.xRatio !== undefined && savedItem.yRatio !== undefined) {
                            // 새 형식 (비율)
                            x = savedItem.xRatio * containerWidth;
                            y = savedItem.yRatio * containerHeight;
                        } else {
                            // 기존 형식 (절대 좌표) - 호환성
                            x = savedItem.x;
                            y = savedItem.y;
                        }
                        
                        item.style.left = `${x}px`;
                        item.style.top = `${y}px`;
                        
                        editorContainer.appendChild(item);
                        layoutItems.push({ id: savedItem.id, element: item, x: x, y: y });
                        item.addEventListener('mousedown', startDrag);
                    });
                }, 100);
            } else {
                initializeItems(); // 저장된 레이아웃이 없거나 유효하지 않으면 기본 아이템 생성
            }
        });
    }

    // 언어 변경 감지 및 적용
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.selectedLanguage) {
            console.log('언어 설정 변경 감지:', changes.selectedLanguage.newValue);
            applyLanguageForCustomLayout(changes.selectedLanguage.newValue || 'auto');
        }
    });

    // 언어 적용 및 초기화
    try {
        console.log('언어 설정 로드 중...');
        const data = await new Promise(resolve => chrome.storage.sync.get('selectedLanguage', resolve));
        const langToApply = data.selectedLanguage || 'auto';
        console.log('적용할 언어:', langToApply);
        const appliedLang = await applyLanguageForCustomLayout(langToApply);
        console.log('언어 적용 완료:', appliedLang);
        loadLayout(); // 언어 적용 후 레이아웃 로드
    } catch (error) {
        console.error("Error applying language in custom-layout:", error);
        await applyLanguageForCustomLayout('auto');
        loadLayout();
    }
}); 