import path from 'path';

export interface Chunk {
    moduleName: string;
    content: string;
    type: string;
}

export class SemanticChunker {
    /**
     * 파일 확장자에 따라 적절한 청킹 수행
     */
    static chunk(filePath: string, content: string): Chunk[] {
        const ext = path.extname(filePath).toLowerCase();
        
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            return this.chunkCode(content);
        } else if (ext === '.md') {
            return this.chunkMarkdown(content);
        }
        
        // 기타 파일은 통째로 반환
        return [{ moduleName: 'Full File', content, type: 'file' }];
    }

    /**
     * 코드 파일 청킹: export 단위로 분리 (Regex 기반 간단 구현)
     */
    private static chunkCode(content: string): Chunk[] {
        const chunks: Chunk[] = [];
        // export class, function, const, interface 등을 찾는 정규식
        const regex = /(?:^|\n)(export\s+(?:class|function|const|interface|type|enum)\s+([a-zA-Z0-9_]+))/g;
        
        let match;
        let lastIndex = 0;
        let currentModuleName = 'Module Info';

        while ((match = regex.exec(content)) !== null) {
            if (lastIndex < match.index) {
                const prevContent = content.substring(lastIndex, match.index).trim();
                if (prevContent) {
                    chunks.push({ moduleName: currentModuleName, content: prevContent, type: 'code_block' });
                }
            }
            currentModuleName = match[2];
            lastIndex = match.index;
        }

        // 마지막 조각 추가
        const lastContent = content.substring(lastIndex).trim();
        if (lastContent) {
            chunks.push({ moduleName: currentModuleName, content: lastContent, type: 'code_block' });
        }

        return chunks.length > 0 ? chunks : [{ moduleName: 'Full Code', content, type: 'file' }];
    }

    /**
     * 마크다운 청킹: 헤더(#) 단위로 분리
     */
    private static chunkMarkdown(content: string): Chunk[] {
        const chunks: Chunk[] = [];
        const lines = content.split('\n');
        let currentHeader = 'Introduction';
        let currentContent: string[] = [];

        for (const line of lines) {
            if (line.startsWith('#')) {
                if (currentContent.length > 0) {
                    chunks.push({ moduleName: currentHeader, content: currentContent.join('\n').trim(), type: 'doc_section' });
                }
                currentHeader = line.replace(/#/g, '').trim();
                currentContent = [line];
            } else {
                currentContent.push(line);
            }
        }

        if (currentContent.length > 0) {
            chunks.push({ moduleName: currentHeader, content: currentContent.join('\n').trim(), type: 'doc_section' });
        }

        return chunks;
    }
}
