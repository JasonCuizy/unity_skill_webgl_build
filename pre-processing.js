class PreProcessing {
    constructor(resourcesUrl) {
        // 创建加载界面并添加到页面
        this.loadingScreen = this.createLoadingScreen();
        document.body.appendChild(this.loadingScreen);
        // 初始化进度相关变量
        this.totalProgress = 0;
        this.currentProgress = 0;
        
        // 添加资源URL配置
        this.resources = resourcesUrl;

        // 添加进度追踪
        this.resourceProgress = {
            data: 0,
            framework: 0,
            code: 0
        };

        // 添加平滑进度过渡
        this.lastProgress = 0;
        this.targetProgress = 0;
        this.progressAnimationFrame = null;

        // 添加重试配置
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2秒
    }

    /**
     * 创建加载界面UI
     * @returns {HTMLElement} 加载界面的DOM元素
     */
    createLoadingScreen() {
        // 创建容器
        const div = document.createElement('div');
        div.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #181818;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        // 创建logo图片
        const logo = document.createElement('img');
        logo.src = 'favicon.ico';
        logo.style.cssText = `
            width: 80px;
            margin-bottom: 30px;
        `;

        // 创建进度条容器
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            width: 300px;
            height: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            overflow: hidden;
        `;

        // 创建进度条
        const progress = document.createElement('div');
        progress.style.cssText = `
            width: 0%;
            height: 100%;
            transition: width 0.3s;
            border-radius: 4px;
            background: #2196F3;
        `;
        progressBar.appendChild(progress);

        // 创建进度文本
        const progressText = document.createElement('div');
        progressText.style.cssText = `
            color: #EEECF1;
            margin-top: 10px;
            font-family: Arial, sans-serif;
            font-size: 24px;
            font-weight: 500;
        `;
        progressText.textContent = '0%';

        // 组装UI元素
        div.appendChild(logo);
        div.appendChild(progressBar);
        div.appendChild(progressText);

        // 保存进度条和文本的引用
        this.progressBar = progress;
        this.progressText = progressText;

        return div;
    }

    /**
     * 更新加载进度显示
     * @param {number} progress - 进度值(0-100)
     */
    updateProgress(progress) {
        this.targetProgress = progress;
        if (!this.progressAnimationFrame) {
            this.animateProgress();
        }
    }

    animateProgress() {
        const step = (this.targetProgress - this.lastProgress) * 0.1;
        this.lastProgress += step;
        
        if (Math.abs(this.targetProgress - this.lastProgress) > 0.1) {
            const totalProgress = Math.round(this.lastProgress);
            this.progressBar.style.width = `${totalProgress}%`;
            this.progressText.textContent = `${totalProgress}%`;
            
            this.progressAnimationFrame = requestAnimationFrame(() => this.animateProgress());
        } else {
            this.lastProgress = this.targetProgress;
            this.progressBar.style.width = `${Math.round(this.targetProgress)}%`;
            this.progressText.textContent = `${Math.round(this.targetProgress)}%`;
            this.progressAnimationFrame = null;
        }
    }

    /**
     * 处理Unity加载进度
     * @param {number} progress - Unity加载进度(0-1)
     */
    onUnityProgress(progress) {
        // Unity加载进度从70%到90%，预留最后10%给加载完成时使用
        const totalProgress = 70 + (progress * 20);
        this.updateProgress(totalProgress);
    }

    async onLoadUnityScene() {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        
        // 按顺序更新进度
        this.updateProgress(90);
        await sleep(300);

        this.updateProgress(92);
        await sleep(300);

        this.updateProgress(94);
        await sleep(400);
        
        this.updateProgress(97);
        await sleep(500);
        
        this.updateProgress(100);
        await sleep(500);
        
        this.hideLoadingScreen();
    }

    /**
     * 隐藏加载界面
     */
    hideLoadingScreen() {
        this.loadingScreen.style.display = 'none';
    }

    async fetchAndUnzip(url, mimeType = '', onProgress) {
        let retries = 0;
        
        while (retries < this.maxRetries) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                // 如果服务器正确设置了Content-Encoding: gzip，浏览器会自动解压
                if (response.headers.get('Content-Encoding') === 'gzip') {
                    const blob = await response.blob();
                    if (onProgress) {
                        onProgress(1);
                    }
                    return URL.createObjectURL(blob);
                }

                const contentLength = +response.headers.get('Content-Length');
                if (!contentLength) {
                    throw new Error('无法获取内容长度');
                }
                
                const reader = response.body.getReader();
                let receivedLength = 0;
                let chunks = [];
                
                while(true) {
                    const {done, value} = await reader.read();
                    
                    if (done) break;
                    
                    chunks.push(value);
                    receivedLength += value.length;
                    
                    if (onProgress) {
                        onProgress(receivedLength / contentLength);
                    }
                }
                
                const chunksAll = new Uint8Array(receivedLength);
                let position = 0;
                for(let chunk of chunks) {
                    chunksAll.set(chunk, position);
                    position += chunk.length;
                }
                
                const unzipped = pako.ungzip(chunksAll);
                return URL.createObjectURL(new Blob([unzipped], mimeType ? {type: mimeType} : undefined));
                
            } catch (error) {
                retries++;
                if (retries === this.maxRetries) {
                    throw new Error(`加载失败 (${url}): ${error.message}`);
                }
                console.warn(`重试 ${retries}/${this.maxRetries}: ${url}`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
    }

    /**
     * 计算总体下载进度
     * @returns {number} 0-70之间的进度值
     */
    calculateDownloadProgress() {
        const weights = {
            data: 0.6,      // data文件通常最大，给60%的权重
            framework: 0.2,  // framework给20%的权重
            code: 0.2       // wasm文件给20%的权重
        };
        
        const weightedProgress = 
            this.resourceProgress.data * weights.data +
            this.resourceProgress.framework * weights.framework +
            this.resourceProgress.code * weights.code;
            
        return weightedProgress * 70; // 转换到0-70范围
    }

    async loadResources() {
        try {
            const results = await Promise.all([
                this.fetchAndUnzip(
                    this.resources.data.url, 
                    this.resources.data.mimeType,
                    progress => {
                        this.resourceProgress.data = progress;
                        this.updateProgress(this.calculateDownloadProgress());
                    }
                ),
                this.fetchAndUnzip(
                    this.resources.framework.url, 
                    this.resources.framework.mimeType,
                    progress => {
                        this.resourceProgress.framework = progress;
                        this.updateProgress(this.calculateDownloadProgress());
                    }
                ),
                this.fetchAndUnzip(
                    this.resources.code.url, 
                    this.resources.code.mimeType,
                    progress => {
                        this.resourceProgress.code = progress;
                        this.updateProgress(this.calculateDownloadProgress());
                    }
                )
            ]);

            return {
                dataUrl: results[0],
                frameworkUrl: results[1],
                codeUrl: results[2]
            };
        } catch (error) {
            console.error('Error loading resources:', error);
            throw error;
        }
    }

    // 添加错误提示方法
    showErrorMessage(message) {
        if (!this.errorMessage) {
            this.errorMessage = document.createElement('div');
            this.errorMessage.style.cssText = `
                color: #ff4444;
                margin-top: 20px;
                text-align: center;
                font-family: Arial, sans-serif;
                padding: 0 20px;
            `;
            this.loadingScreen.appendChild(this.errorMessage);
        }
        this.errorMessage.textContent = `加载失败: ${message}`;
        this.progressBar.style.background = '#ff4444';
    }
} 
