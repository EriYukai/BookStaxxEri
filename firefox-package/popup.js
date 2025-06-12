const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh_CN', 'es', 'fr', 'de', 'ru', 'pt_BR', 'hi'];

async function applyLanguageForPopup(lang) {
    let targetLang = lang;
    let messagesToUse = null;

    if (lang === 'auto' || !lang) {
        targetLang = chrome.i18n.getUILanguage().split('-')[0];
        if (!SUPPORTED_LANGUAGES.includes(targetLang)) {
            targetLang = 'en'; // 지원 목록에 없으면 영어로
        }
    }
    console.log(`Popup UI 언어 적용 시도: ${targetLang} (선택값: ${lang})`);

    try {
        const result = await new Promise(resolve => chrome.storage.local.get([`i18n_${targetLang}`, 'i18n_en'], resolve));
        if (result[`i18n_${targetLang}`]) {
            messagesToUse = result[`i18n_${targetLang}`];
        } else if (result.i18n_en) {
            messagesToUse = result.i18n_en;
            targetLang = 'en'; 
        } else {
            console.error('Popup: Required language messages not found.');
            return;
        }
    } catch (error) {
        console.error('Popup: Error loading messages from local storage:', error);
        return;
    }

    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        const messageData = messagesToUse[key];
        const message = messageData ? messageData.message : null;
        
        if (message) {
            if (elem.tagName === 'TITLE') {
                elem.textContent = message;
            } else if (elem.tagName === 'SPAN' && elem.parentElement.tagName === 'BUTTON'){
                // <button><svg>...</svg><span data-i18n="key">TEXT</span></button> 구조
                elem.textContent = message;
            } else if (elem.classList.contains('title') || elem.classList.contains('footer')) {
                // div.title, div.footer
                elem.textContent = message;
            }
            // 다른 필요한 요소들에 대한 처리 추가 가능
        } else {
            // console.warn(`popup.html: 번역 없음 또는 키 반환됨: [${key}] for lang '${targetLang}'.`);
        }
    });

    const versionElement = document.getElementById('popupVersion');
    if (versionElement) {
        // 버전 정보는 국제화하지 않고 manifest에서 직접 가져옴
        versionElement.textContent = `v${chrome.runtime.getManifest().version}`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const optionsButton = document.getElementById('options-button');
    const donateButton = document.getElementById('donate-button');
    const importButton = document.getElementById('import-button');
    const donateUrl = 'https://buymeacoffee.com/erinyan'; // Define donation URL

    if (optionsButton) {
        optionsButton.addEventListener('click', () => {
            // Open the extension's options page
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                // Fallback for older versions or if the function is unavailable
                window.open(chrome.runtime.getURL('options.html'));
            }
        });
    }

    if (importButton) {
        importButton.addEventListener('click', () => {
            // 옵션 페이지를 열고 북마크 불러오기 섹션 표시 요청
            chrome.storage.local.set({ 'showImportSection': true }, () => {
                if (chrome.runtime.lastError) {
                    console.error("북마크 불러오기 상태 설정 오류:", chrome.runtime.lastError);
                } else {
                    console.log("북마크 불러오기 상태가 설정되었습니다.");
                    // 옵션 페이지 열기
                    if (chrome.runtime.openOptionsPage) {
                        chrome.runtime.openOptionsPage();
                    } else {
                        window.open(chrome.runtime.getURL('options.html'));
                    }
                }
            });
        });
    }

    if (donateButton) {
        donateButton.addEventListener('click', () => {
            // Open the donation link in a new tab
            chrome.tabs.create({ url: donateUrl });
        });
    }

    // 언어 적용 로직 수정
    try {
        const data = await new Promise(resolve => chrome.storage.sync.get('selectedLanguage', resolve));
        const langToApply = data.selectedLanguage || 'auto';
        await applyLanguageForPopup(langToApply);
    } catch (error) {
        console.error("Error applying language in popup:", error);
        await applyLanguageForPopup('auto'); // 오류 시 자동 또는 기본 언어로 시도
    }
}); 