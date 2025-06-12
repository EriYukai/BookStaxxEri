// 파일 선택 시 파일명 표시 및 미리보기 업데이트
document.addEventListener('DOMContentLoaded', function() {
    const fileInputs = [
        {input: 'mouseCursorIcon', fileName: 'mouseCursorFileName', preview: 'mouseCursorPreview', noPreview: 'mouseCursorNoPreview', button: 'mouseCursorIconBtn'},
        {input: 'backButtonIcon', fileName: 'backButtonFileName', preview: 'backButtonPreview', noPreview: 'backButtonNoPreview', button: 'backButtonIconBtn'},
        {input: 'addButtonIcon', fileName: 'addButtonFileName', preview: 'addButtonPreview', noPreview: 'addButtonNoPreview', button: 'addButtonIconBtn'}
    ];
    
    fileInputs.forEach(item => {
        const input = document.getElementById(item.input);
        const fileNameSpan = document.getElementById(item.fileName);
        const preview = document.getElementById(item.preview);
        const noPreview = document.getElementById(item.noPreview);
        const button = document.getElementById(item.button);
        
        // 파일 선택 버튼 클릭 이벤트
        button.addEventListener('click', function() {
            input.click();
        });
        
        // 파일 선택 후 이벤트
        input.addEventListener('change', function() {
            if (this.files.length > 0) {
                fileNameSpan.textContent = this.files[0].name;
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                    noPreview.classList.add('hidden');
                };
                reader.readAsDataURL(this.files[0]);
            } else {
                fileNameSpan.textContent = chrome.i18n.getMessage('noFileSelected') || 'No file selected';
                preview.classList.add('hidden');
                noPreview.classList.remove('hidden');
            }
        });
    });
    
    // 이미지 크기 제한을 위한 추가 기능
    // 모든 이미지와 SVG 요소에 클래스 추가
    const allImages = document.querySelectorAll('img, svg');
    allImages.forEach(img => {
        // 이미 크기가 제한된 작은 아이콘은 제외
        if (!img.classList.contains('btn-icon') && 
            !img.classList.contains('bookstaxx-favicon')) {
            img.classList.add('img-icon');
        }
    });
    
    // 5초 후 다시 한번 실행 (동적으로 추가된 요소 처리)
    setTimeout(() => {
        const allImages = document.querySelectorAll('img, svg');
        allImages.forEach(img => {
            if (!img.classList.contains('btn-icon') && 
                !img.classList.contains('bookstaxx-favicon')) {
                img.classList.add('img-icon');
            }
        });
    }, 5000);
    
    // SVG 아이콘에 대한 크기 제한 설정
    const svgElements = document.querySelectorAll('svg');
    svgElements.forEach(svg => {
        if (svg.parentElement && svg.parentElement.classList.contains('btn')) {
            svg.style.width = '20px';
            svg.style.height = '20px';
            svg.style.minWidth = '20px';
            svg.style.maxWidth = '20px';
            svg.style.maxHeight = '20px';
        }
    });
    
    // 닫기 버튼의 SVG 아이콘 크기 특별 처리
    const skipImportButton = document.getElementById('skip-import-button');
    if (skipImportButton) {
        const svgInButton = skipImportButton.querySelector('svg');
        if (svgInButton) {
            svgInButton.style.width = '16px';
            svgInButton.style.height = '16px';
            svgInButton.style.minWidth = '16px';
            svgInButton.style.maxWidth = '16px';
            svgInButton.style.maxHeight = '16px';
        }
    }

    // --- options.html에서 옮겨온 첫 번째 인라인 스크립트 내용 시작 ---
    const welcomeMsg = document.getElementById('welcome-message');
    const urlParams = new URLSearchParams(window.location.search);
    const isFirstInstall = urlParams.get('firstInstall') === 'true';

    if (isFirstInstall && welcomeMsg) {
        welcomeMsg.classList.remove('welcome-hidden');
        createConfetti();
        setTimeout(() => {
            if (welcomeMsg) { // welcomeMsg가 여전히 존재하는지 확인
                welcomeMsg.style.animation = 'fadeOut 0.8s forwards';
                setTimeout(() => {
                    if (welcomeMsg) welcomeMsg.classList.add('welcome-hidden');
                }, 800);
            }
        }, 300000); // 5분
    } else if (welcomeMsg) {
        welcomeMsg.classList.add('welcome-hidden');
    }

    // const skipImportButton = document.getElementById('skip-import-button'); // 이 선언을 주석 처리 또는 삭제
    if (skipImportButton) { // 이미 상단에서 선언된 skipImportButton 변수 사용
        skipImportButton.addEventListener('click', function() {
            const importSection = document.getElementById('initial-import-section');
            if (importSection) {
                importSection.style.display = 'none';
            }
        });
    }
    // --- options.html에서 옮겨온 첫 번째 인라인 스크립트 내용 끝 ---

    // --- options.html에서 옮겨온 두 번째 인라인 스크립트 내용 시작 ---
    // 북마크 불러오기 섹션 숨기기/표시 토글 함수 (options.js에도 유사 함수 존재 가능성 유의)
    // window.toggleImportSection = function() { // 전역 함수로 만들거나, 필요한 곳에서 직접 호출
    //     const importSection = document.getElementById('initial-import-section');
    //     if (importSection) {
    //         importSection.style.display = importSection.style.display === 'none' ? 'flex' : 'none';
    //     }
    // }

    // 옵션 페이지 하단의 "북마크 불러오기" 버튼 이벤트 핸들러
    const showImportButtonBottom = document.getElementById('show-import-button');
    if (showImportButtonBottom) {
        showImportButtonBottom.addEventListener('click', function() {
            const importSection = document.getElementById('initial-import-section');
            if (importSection) {
                importSection.style.display = 'flex'; // 또는 block, 상황에 맞게
                importSection.scrollIntoView({ behavior: 'smooth' });
                 // loadImportFolderList(); // 필요시 폴더 목록 다시 로드
            }
        });
    }
    // --- options.html에서 옮겨온 두 번째 인라인 스크립트 내용 끝 ---
});

// 애니메이션 파티클(폭죽) 효과 함수 (options.html에서 옮겨옴, 전역으로 유지 또는 필요한 곳으로 이동)
function createConfetti() {
    const container = document.querySelector('.content-container');
    if (!container) return;
    const confettiCount = 150;
    const colors = ['#4285f4', '#34a853', '#fbbc05', '#ea4335'];
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        confetti.style.animationDelay = Math.random() * 5 + 's';
        
        container.appendChild(confetti);
        
        setTimeout(() => {
            if (confetti && confetti.parentElement) {
                confetti.parentElement.removeChild(confetti);
            }
        }, 8000);
    }
}

function handleImageUpload(event, iconType) {
    const iconKey = event.target.id;
    const file = event.target.files[0];
    
    if (!file) {
        console.log("파일이 선택되지 않았습니다.");
        return;
    }
    
    // 미리보기 요소 ID 가져오기
    const fileNameSpan = document.getElementById(`${iconKey}FileName`);
    const previewImg = document.getElementById(`${iconKey}Preview`);
    const noPreviewSpan = document.getElementById(`${iconKey}NoPreview`);
    
    // 파일 이름 표시
    if (fileNameSpan) {
        fileNameSpan.textContent = file.name;
    }
    
    // 이미지 최적화 실행
    optimizeImage(file, iconKey)
        .then(dataUrl => {
            try {
                console.log(`${iconKey} 이미지 최적화 성공, 데이터 URL 길이: ${dataUrl.length}`);
                
                // 미리보기 표시
                if (previewImg && noPreviewSpan) {
                    previewImg.src = dataUrl;
                    previewImg.classList.remove('hidden');
                    noPreviewSpan.classList.add('hidden');
                }
                
                // 커스텀 이미지 상태 업데이트
                chrome.storage.local.get([`${iconKey}_customMeta`], (result) => {
                    const metaData = result[`${iconKey}_customMeta`] || {};
                    console.log(`로드된 메타데이터:`, metaData);
                    
                    // 이미지 유형별 상태 정보 저장 (기존 상태 유지하면서 추가)
                    chrome.storage.sync.get(['customImageStatus'], (statusResult) => {
                        const customStatus = statusResult.customImageStatus || {};
                        
                        // 현재 이미지 상태 업데이트
                        customStatus[iconKey] = {
                            isCustom: true,
                            timestamp: Date.now(),
                            // 버튼 이미지인 경우 항상 배경 제거 플래그 활성화
                            removeBackground: (iconKey === 'backButtonIcon' || iconKey === 'addButtonIcon') ? true : (metaData.removeBackground || false),
                            isPNG: metaData.isPNG || false,
                            hasTransparency: metaData.hasTransparency || false
                        };
                        
                        console.log(`업데이트된 커스텀 이미지 상태:`, customStatus);
                        
                        // 상태 저장
                        chrome.storage.sync.set({ customImageStatus: customStatus }, () => {
                            console.log(`${iconKey} 커스텀 이미지 상태 업데이트 완료`);
                        });
                    });
                    
                    // 이미지 데이터 분할 저장 (크기가 큰 경우)
                    const isLargeData = dataUrl.length > 1024 * 1024; // 1MB 이상
                    
                    if (isLargeData) {
                        console.log(`대용량 이미지 분할 저장 시작 (${Math.round(dataUrl.length / 1024)}KB)`);
                        saveBase64DataInChunks(iconKey, dataUrl)
                            .then(() => console.log(`${iconKey} 분할 저장 완료`))
                            .catch(error => console.error(`${iconKey} 분할 저장 실패:`, error));
                    } else {
                        // 작은 이미지는 단일 항목으로 저장
                        chrome.storage.local.set({ [iconKey]: dataUrl }, () => {
                            console.log(`${iconKey} 단일 항목 저장 완료`);
                        });
                    }
                });
            } catch (error) {
                console.error(`${iconKey} 이미지 업로드 처리 중 오류:`, error);
                showError(`이미지 처리 중 오류가 발생했습니다: ${error.message}`);
            }
        })
        .catch(error => {
            console.error(`${iconKey} 이미지 최적화 실패:`, error);
            showError(`이미지 최적화 실패: ${error.message}`);
        });
} 