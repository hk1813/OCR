const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const dropText = document.getElementById('dropText');
const fileName = document.getElementById('fileName');
const viewFileBtn = document.getElementById('viewFileBtn');
const fileViewer = document.getElementById('fileViewer');
const viewerFileName = document.getElementById('viewerFileName');
const viewerClose = document.getElementById('viewerClose');
const pdfPreview = document.getElementById('pdfPreview');
const imagePreview = document.getElementById('imagePreview');
const promptInput = document.getElementById('promptInput');
const extractBtn = document.getElementById('extractBtn');
const resultArea = document.getElementById('resultArea');
const loading = document.getElementById('loading');
const rawBtn = document.getElementById('rawBtn');
const jsonBtn = document.getElementById('jsonBtn');

let selectedFile = null;
let fileDataUrl = null;
let rawResult = '';
let jsonResult = '';
let activeMode = 'raw';

// Click dropzone to open file picker (but not when clicking view button)
dropzone.addEventListener('click', (e) => {
  if (e.target === viewFileBtn || viewFileBtn.contains(e.target)) return;
  fileInput.click();
});

// File selected via picker
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

// Drag & drop
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// Handle file upload — just show filename + view button, stay on dropzone
function handleFile(file) {
  selectedFile = file;
  rawResult = '';
  jsonResult = '';
  resultArea.textContent = 'Upload a file and click Extract to see results here.';

  // Show filename and view button
  fileName.textContent = '📄 ' + file.name;
  viewFileBtn.style.display = 'inline-block';

  // Read file as data URL for later viewing
  const reader = new FileReader();
  reader.onload = (e) => {
    fileDataUrl = e.target.result;
  };
  reader.readAsDataURL(file);
}

// "View File" button — open the viewer
viewFileBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // don't trigger dropzone click
  if (!selectedFile || !fileDataUrl) return;

  // Hide dropzone, show viewer
  dropzone.style.display = 'none';
  fileViewer.style.display = 'flex';
  viewerFileName.textContent = selectedFile.name;

  // Reset previews
  pdfPreview.style.display = 'none';
  pdfPreview.src = '';
  imagePreview.style.display = 'none';
  imagePreview.src = '';

  if (selectedFile.type === 'application/pdf') {
    pdfPreview.src = fileDataUrl;
    pdfPreview.style.display = 'block';
  } else if (selectedFile.type.startsWith('image/')) {
    imagePreview.src = fileDataUrl;
    imagePreview.style.display = 'block';
  }
});

// Close viewer — go back to dropzone
viewerClose.addEventListener('click', (e) => {
  e.stopPropagation();
  fileViewer.style.display = 'none';
  dropzone.style.display = 'flex';
  // Keep the file selected, just close the viewer
});

// Toggle buttons
rawBtn.addEventListener('click', () => {
  if (activeMode === 'raw') return;
  activeMode = 'raw';
  rawBtn.classList.add('active');
  jsonBtn.classList.remove('active');
  if (rawResult) {
    resultArea.textContent = rawResult;
  }
});

jsonBtn.addEventListener('click', async () => {
  if (activeMode === 'json') return;
  activeMode = 'json';
  jsonBtn.classList.add('active');
  rawBtn.classList.remove('active');

  if (jsonResult) {
    resultArea.textContent = jsonResult;
    return;
  }

  if (rawResult) {
    await fetchJsonVersion();
  }
});

// Extract button
extractBtn.addEventListener('click', async () => {
  if (!selectedFile) {
    alert('Please upload a file first.');
    return;
  }

  const prompt = promptInput.value.trim() || 'Extract all text and data from this document.';

  rawResult = '';
  jsonResult = '';

  extractBtn.disabled = true;
  extractBtn.textContent = 'Extracting...';
  loading.style.display = 'block';
  resultArea.textContent = '';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('prompt', prompt);

    const res = await fetch('/api/extract', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (data.error) {
      resultArea.textContent = '❌ Error: ' + data.error;
    } else {
      rawResult = data.result;

      if (activeMode === 'raw') {
        resultArea.textContent = rawResult;
      } else {
        resultArea.textContent = rawResult;
        await fetchJsonVersion();
      }
    }
  } catch (err) {
    resultArea.textContent = '❌ Network error: ' + err.message;
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract ➜';
    loading.style.display = 'none';
  }
});

// Fetch JSON conversion
async function fetchJsonVersion() {
  if (!selectedFile) return;

  loading.style.display = 'block';
  resultArea.textContent = 'Converting to JSON...';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('prompt',
      (promptInput.value.trim() || 'Extract all text and data from this document.') +
      '\n\nIMPORTANT: Return the extracted data as a well-structured JSON object. Only output valid JSON, no extra text.'
    );

    const res = await fetch('/api/extract', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (data.error) {
      resultArea.textContent = '❌ Error: ' + data.error;
    } else {
      try {
        const parsed = JSON.parse(data.result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        jsonResult = JSON.stringify(parsed, null, 2);
      } catch {
        jsonResult = data.result;
      }
      resultArea.textContent = jsonResult;
    }
  } catch (err) {
    resultArea.textContent = '❌ Network error: ' + err.message;
  } finally {
    loading.style.display = 'none';
  }
}
