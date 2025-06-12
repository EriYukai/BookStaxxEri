// 페이지 레이아웃 관리 스크립트
"use strict";

// 여백 제거 함수
function removeMargins() {
    // 모든 요소의 마진과 패딩 제거
    const allElements = document.querySelectorAll('body, html, div, section, form');
    allElements.forEach(el => {
        el.style.marginBottom = '0';
        el.style.paddingBottom = '0';
    });
    
    // body 스타일 강제 적용
    document.body.style.minHeight = '100vh';
    document.body.style.height = '100vh';
    document.body.style.maxHeight = '100vh';
    document.body.style.overflow = 'hidden';
    
    // 콘텐츠 영역 스타일 강제 적용
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.height = '100vh';
        mainContent.style.marginBottom = '0';
        mainContent.style.paddingBottom = '0';
    }
}

// 화면 크기에 따른 동적 높이 조절 함수
function adjustHeight() {
    const windowHeight = window.innerHeight;
    const mainContent = document.querySelector('.main-content');
    const form = document.getElementById('options-form');
    const footerHeight = 10; // 하단 여백 보정값
    
    if (mainContent) {
        // 메인 컨텐츠 영역 높이 설정
        mainContent.style.height = (windowHeight - footerHeight) + 'px';
        
        // form이 남은 공간을 채우도록 설정
        if (form) {
            const otherElements = mainContent.querySelectorAll(':not(#options-form)');
            let otherHeight = 0;
            
            otherElements.forEach(el => {
                if (el.offsetHeight) {
                    otherHeight += el.offsetHeight;
                }
            });
            
            // form 높이 계산 (창 높이 - 다른 요소 높이 - 여백)
            const formHeight = windowHeight - otherHeight - footerHeight - 50;
            form.style.minHeight = formHeight + 'px';
        }
    }
    
    // 문서 전체의 body 높이 설정
    document.body.style.height = windowHeight + 'px';
    document.body.style.minHeight = windowHeight + 'px';
    document.body.style.maxHeight = windowHeight + 'px';
    
    // 모든 요소의 하단 여백 제거
    const allElements = document.querySelectorAll('div, section, form');
    allElements.forEach(el => {
        el.style.marginBottom = '0';
        el.style.paddingBottom = '0';
    });
}

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', function() {
    // DOM이 완전히 로드된 후 초기화 실행
    removeMargins();
    adjustHeight();
    
    // 화면 크기 변경 시 다시 실행
    window.addEventListener('resize', adjustHeight);
}); 