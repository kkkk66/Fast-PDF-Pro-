const { PDFDocument, PDFHeader } = window.PDFLib;

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const encryptBtn = document.getElementById('encrypt-btn');
  const downloadBtn = document.getElementById('download-btn');
  const feedbackArea = document.getElementById('feedback-area');

  let currentFile = null;
  let encryptedBytes = null;

  // File Upload Logic
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file.');
      return;
    }
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    fileInfo.classList.remove('hidden');
    validateForm();
  }

  // Password Validation
  const userPw = document.getElementById('user-pw');
  const userPwConfirm = document.getElementById('user-pw-confirm');
  const pwError = document.getElementById('pw-error');

  function validateForm() {
    const pw1 = userPw.value;
    const pw2 = userPwConfirm.value;
    
    if (pw1 && pw2 && pw1 !== pw2) {
      pwError.style.display = 'block';
      encryptBtn.disabled = true;
    } else {
      pwError.style.display = 'none';
      encryptBtn.disabled = !currentFile || !pw1;
    }
  }

  userPw.addEventListener('input', validateForm);
  userPwConfirm.addEventListener('input', validateForm);

  // Encryption Logic
  encryptBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    try {
      encryptBtn.disabled = true;
      encryptBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Encrypting...';
      lucide.createIcons();

      const arrayBuffer = await currentFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      if (pdfDoc.isEncrypted) {
        throw new Error('This PDF is already encrypted. Please upload an unencrypted PDF.');
      }

      const encType = document.getElementById('enc-type').value;
      const userPassword = userPw.value;
      const ownerPassword = document.getElementById('owner-pw').value || userPassword;

      // Map encryption type to PDF version
      let versionStr = '1.7ext3'; // AES-256
      let algoName = 'AES-256';
      let rev = 6;
      let keyLen = 256;

      if (encType === 'AES-128') {
        versionStr = '1.6';
        algoName = 'AES-128';
        rev = 4;
        keyLen = 128;
      } else if (encType === 'RC4-128') {
        versionStr = '1.4';
        algoName = 'RC4';
        rev = 3;
        keyLen = 128;
      } else if (encType === 'RC4-40') {
        versionStr = '1.3';
        algoName = 'RC4';
        rev = 2;
        keyLen = 40;
      }

      // Hack to force version for encryption
      if (PDFHeader && PDFHeader.forVersion) {
         pdfDoc.context.header = PDFHeader.forVersion(1, versionStr.replace('1.', ''));
      } else {
         // Fallback if PDFHeader is not exposed
         pdfDoc.context.header = { getVersion: () => versionStr };
      }

      const permissions = {
        printing: document.getElementById('perm-print').checked ? 'highResolution' : false,
        copying: document.getElementById('perm-copy').checked,
        modifying: document.getElementById('perm-modify').checked,
        fillingForms: document.getElementById('perm-fill').checked,
        annotating: document.getElementById('perm-annotate').checked,
        contentAccessibility: document.getElementById('perm-access').checked,
        documentAssembly: document.getElementById('perm-assemble').checked,
      };

      await pdfDoc.encrypt({
        userPassword,
        ownerPassword,
        permissions
      });

      encryptedBytes = await pdfDoc.save();

      // Show Feedback
      document.getElementById('fb-algo').textContent = algoName;
      document.getElementById('fb-rev').textContent = rev;
      document.getElementById('fb-key').textContent = keyLen + ' bits';
      
      const activePerms = Object.entries(permissions)
        .filter(([_, val]) => val)
        .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase())
        .join(', ');
      
      document.getElementById('fb-perms').textContent = activePerms || 'None';

      feedbackArea.classList.remove('hidden');
      
      encryptBtn.innerHTML = '<i data-lucide="check"></i> Encrypted Successfully';
      lucide.createIcons();

    } catch (error) {
      console.error(error);
      alert('Error encrypting PDF: ' + error.message);
      encryptBtn.disabled = false;
      encryptBtn.innerHTML = '<i data-lucide="lock"></i> Encrypt & Lock PDF';
      lucide.createIcons();
    }
  });

  // Download Logic
  downloadBtn.addEventListener('click', () => {
    if (!encryptedBytes) return;
    
    const blob = new Blob([encryptedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `locked_${currentFile.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
