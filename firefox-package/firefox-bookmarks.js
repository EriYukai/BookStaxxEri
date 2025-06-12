// Firefox 전용 북마크 처리 모듈
class FirefoxBookmarkManager {
    constructor() {
        this.api = typeof browser !== 'undefined' ? browser : chrome;
        this.isFirefox = this.detectFirefox();
        console.log('[Firefox Bookmarks] 초기화:', { isFirefox: this.isFirefox });
    }

    detectFirefox() {
        return typeof browser !== 'undefined' && 
               navigator.userAgent.toLowerCase().includes('firefox');
    }

    async getFolders() {
        console.log('[Firefox Bookmarks] 폴더 가져오기 시작');
        
        try {
            // Method 1: Standard getTree
            const tree = await this.api.bookmarks.getTree();
            if (tree && tree.length > 0) {
                console.log('[Firefox Bookmarks] getTree 성공:', tree.length);
                return this.extractFolders(tree);
            }
        } catch (error) {
            console.log('[Firefox Bookmarks] getTree 실패:', error);
        }

        try {
            // Method 2: Search all bookmarks
            const allBookmarks = await this.api.bookmarks.search({});
            console.log('[Firefox Bookmarks] search 결과:', allBookmarks.length);
            return this.extractFoldersFromSearch(allBookmarks);
        } catch (error) {
            console.log('[Firefox Bookmarks] search 실패:', error);
        }

        // Method 3: Fallback folders
        console.log('[Firefox Bookmarks] 폴백 폴더 사용');
        return this.getFallbackFolders();
    }

    extractFolders(tree) {
        const folders = [];
        
        function traverse(nodes, level = 0) {
            for (const node of nodes) {
                if (!node.url && node.id !== '0') { // 폴더만 추출
                    folders.push({
                        id: node.id,
                        title: node.title || 'Unnamed Folder',
                        parentId: node.parentId,
                        level: level
                    });
                }
                if (node.children) {
                    traverse(node.children, level + 1);
                }
            }
        }

        traverse(tree);
        console.log('[Firefox Bookmarks] 추출된 폴더:', folders.length);
        return folders;
    }

    extractFoldersFromSearch(bookmarks) {
        const folders = bookmarks
            .filter(bookmark => !bookmark.url) // 폴더만
            .map(folder => ({
                id: folder.id,
                title: folder.title || 'Unnamed Folder',
                parentId: folder.parentId,
                level: 0
            }));
        
        console.log('[Firefox Bookmarks] 검색에서 추출된 폴더:', folders.length);
        return folders;
    }

    getFallbackFolders() {
        return [
            { id: 'toolbar_____', title: 'Bookmarks Toolbar', parentId: null, level: 0 },
            { id: 'menu________', title: 'Bookmarks Menu', parentId: null, level: 0 },
            { id: 'unfiled_____', title: 'Other Bookmarks', parentId: null, level: 0 }
        ];
    }
}

// 전역 인스턴스
if (typeof window !== 'undefined') {
    window.firefoxBookmarkManager = new FirefoxBookmarkManager();
}