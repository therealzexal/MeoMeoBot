const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const extensions = ['.js', '.css', '.html'];
const ignoredDirs = ['.git', 'node_modules', '.dist', 'dist', '.gemini'];
const ignoredFiles = ['package-lock.json', 'cleanup.js'];

function stripJsCssComments(content) {
    const regex = /((["'])(?:(?=(\\?))\3.)*?\2|`[^`]*`)|(\/\*[\s\S]*?\*\/)|(\/\/.*)/g;

    return content.replace(regex, (match, string, quote, escape, blockComment, lineComment) => {
        if (string) return string;
        if (blockComment) {
            if (blockComment.includes('__CUSTOM_CSS__')) return match;
            return '';
        }
        if (lineComment) return '';
        return match;
    });
}

function stripHtmlComments(content) {
    let text = content.replace(/<!--[\s\S]*?-->/g, '');

    text = text.replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)/gi, (match, start, inner, end) => {
        return start + stripJsCssComments(inner) + end;
    });

    text = text.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, start, inner, end) => {
        return start + stripJsCssComments(inner) + end;
    });

    return text;
}

function processFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!extensions.includes(ext)) return;
    if (ignoredFiles.includes(path.basename(filePath))) return;

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        let newContent = content;

        if (ext === '.js' || ext === '.css') {
            newContent = stripJsCssComments(content);
        } else if (ext === '.html') {
            newContent = stripHtmlComments(content);
        }

        if (newContent !== content) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`Cleaned: ${filePath}`);
        }
    } catch (e) {
        console.error(`Error processing ${filePath}:`, e);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!ignoredDirs.includes(file)) {
                walkDir(fullPath);
            }
        } else {
            processFile(fullPath);
        }
    }
}

console.log('Starting cleanup...');
walkDir(rootDir);
console.log('Cleanup finished.');
