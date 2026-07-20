const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add transformers CDN
if (!html.includes('@xenova/transformers')) {
  html = html.replace('</head>', '  <script src="https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"></script>\n</head>');
}

// 2. Add translations
let transRuOld = /processing:\s*'Обработка\.\.\.',\s*processAll:\s*'Обработать все'/g;
let transRuNew = `processing: 'Обработка...',
      aiLoading: 'Нейросеть загружается...',
      aiRemoving: 'Удаление фона...',
      processAll: 'Обработать все'`;
html = html.replace(transRuOld, transRuNew);

let transEnOld = /processing:\s*'Processing\.\.\.',\s*processAll:\s*'Process All'/g;
let transEnNew = `processing: 'Processing...',
      aiLoading: 'AI loading...',
      aiRemoving: 'Removing background...',
      processAll: 'Process All'`;
html = html.replace(transEnOld, transEnNew);

// 3. Add background removal logic to ImageService
let imageServiceStart = /class ImageService \{/;
if (!html.includes('async removeBackground(img,')) {
  let bgRemovalLogic = `class ImageService {

    constructor() {
      this.segmenter = null;
    }

    // Инициализация или получение модели удаления фона
    async _getSegmenter(onProgress) {
      if (!this.segmenter) {
        // Конфигурация transformers.js
        window.env.allowLocalModels = false;
        window.env.useBrowserCache = true;
        
        this.segmenter = await window.pipeline('image-segmentation', 'briaai/RMBG-1.4', {
          progress_callback: function(data) {
            if (onProgress && data.status === 'progress') {
              onProgress('aiLoading', data.progress);
            }
          }
        });
      }
      return this.segmenter;
    }

    // Удаляет фон, возвращает ImageBitmap или Canvas с вырезанным объектом
    async removeBackground(img, onProgress) {
      if (onProgress) onProgress('aiRemoving');
      var segmenter = await this._getSegmenter(onProgress);

      var tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = img.width || img.naturalWidth;
      tmpCanvas.height = img.height || img.naturalHeight;
      var tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(img, 0, 0);
      var blob = await this._toBlob(tmpCanvas, 'image/jpeg', 1.0);
      var url = URL.createObjectURL(blob);

      var result = await segmenter(url);
      URL.revokeObjectURL(url);

      var maskImage = result.find(function(r) { return r.label === 'foreground' || r.label === 'background' || r.mask; });
      if (!maskImage) maskImage = result[0];

      var outCanvas = document.createElement('canvas');
      outCanvas.width = tmpCanvas.width;
      outCanvas.height = tmpCanvas.height;
      var outCtx = outCanvas.getContext('2d');
      outCtx.drawImage(tmpCanvas, 0, 0);

      var maskCanvas = document.createElement('canvas');
      maskCanvas.width = maskImage.mask.width;
      maskCanvas.height = maskImage.mask.height;
      var maskCtx = maskCanvas.getContext('2d');
      var idata = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
      idata.data.set(maskImage.mask.data);
      maskCtx.putImageData(idata, 0, 0);

      outCtx.globalCompositeOperation = 'destination-in';
      outCtx.drawImage(maskCanvas, 0, 0, outCanvas.width, outCanvas.height);
      outCtx.globalCompositeOperation = 'source-over';

      return outCanvas;
    }`;
  html = html.replace(imageServiceStart, bgRemovalLogic);
}

// 4. Update processFile to accept onProgress and use removeBackground
let processFileOld = /async processFile\(file, options\) \{\s*const \{/;
let processFileNew = `async processFile(file, options, onProgress) {
      const {`;
html = html.replace(processFileOld, processFileNew);

let renderCallOld = /const img\s*=\s*await this\._loadImage\(dataUrl\);\s*const canvas\s*=\s*this\._render\(img, \{ maxSide, productMode, ratio, background, shadow \}\);/;
let renderCallNew = `let img       = await this._loadImage(dataUrl);
      
      if (productMode) {
        try {
          img = await this.removeBackground(img, onProgress);
        } catch (e) {
          console.error('AI BG Removal failed', e);
        }
      }
      
      const canvas  = this._render(img, { maxSide, productMode, ratio, background, shadow });`;
html = html.replace(renderCallOld, renderCallNew);

// 5. Update AppController processAll
let processAllOld = /var result\s*=\s*await this\._svc\.processFile\(entry\.file, Object\.assign\(\{\}, this\._cfg\)\);/;
let processAllNew = `var result       = await this._svc.processFile(entry.file, Object.assign({}, this._cfg), function(state, progress) {
            var msg = TRANSLATIONS[self._lang][state];
            if (progress !== undefined) msg += ' ' + Math.round(progress) + '%';
            self.btnProcess.querySelector('span').textContent = msg;
          });`;
let procAllFuncOld = /async processAll\(\) \{\s*if \(this\._busy\) return;/;
let procAllFuncNew = `async processAll() {
      var self = this;
      if (this._busy) return;`;
html = html.replace(procAllFuncOld, procAllFuncNew);
html = html.replace(processAllOld, processAllNew);

fs.writeFileSync('index.html', html);
console.log('Patched correctly');
