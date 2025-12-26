document.addEventListener('DOMContentLoaded', () => {
    
    // --- API & LOGIC CONFIGURATION ---
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const PROJECT_ID = 'dressr';
    const EFFECT_ID = 'birthdaybackgroundtophoto';
    const POLL_INTERVAL = 2000;
    const MAX_POLLS = 60;
    
    let currentUploadedUrl = null;

    // --- DOM ELEMENTS ---
    // Navigation
    const mobileToggle = document.getElementById('mobile-toggle');
    const navLinks = document.getElementById('nav-links');
    
    // Playground
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const imagePreview = document.getElementById('image-preview');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const downloadBtn = document.getElementById('download-btn');
    
    const resultOriginal = document.getElementById('result-original');
    const resultFinal = document.getElementById('result-final');

    // States
    const stateUpload = document.getElementById('upload-state');
    const statePreview = document.getElementById('preview-state');
    const stateProcessing = document.getElementById('processing-state');
    const stateResult = document.getElementById('result-state');

    // --- HELPER FUNCTIONS ---

    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function switchState(state) {
        // Hide all
        [stateUpload, statePreview, stateProcessing, stateResult].forEach(el => {
            el.classList.remove('active');
            setTimeout(() => {
                if(el !== state) el.classList.add('hidden');
            }, 0);
        });
        
        // Show target
        state.classList.remove('hidden');
        // Force reflow
        void state.offsetWidth;
        state.classList.add('active');
    }

    function updateStatus(text) {
        // Try to find a text element inside the processing state to update
        const statusEl = stateProcessing.querySelector('h3') || stateProcessing.querySelector('p');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    function showError(message) {
        alert(message);
        console.error(message);
    }

    // --- API FUNCTIONS ---

    // Upload file to CDN storage
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        const fileName = 'media/' + uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            `https://core.faceswapper.ai/media/get-upload-url?fileName=${encodeURIComponent(fileName)}&projectId=${PROJECT_ID}`,
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://assets.dressr.ai/' + fileName;
        return downloadUrl;
    }

    // Submit image generation job
    async function submitImageGenJob(imageUrl) {
        const response = await fetch('https://api.chromastudio.ai/image-gen', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Origin': 'https://www.chromastudio.ai',
                'Referer': 'https://www.chromastudio.ai/'
            },
            body: JSON.stringify({
                model: 'image-effects',
                toolType: 'image-effects',
                effectId: EFFECT_ID,
                imageUrl: imageUrl,
                userId: USER_ID,
                removeWatermark: true,
                isPrivate: true
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status
    async function pollJobStatus(jobId) {
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `https://api.chromastudio.ai/image-gen/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Origin': 'https://www.chromastudio.ai',
                        'Referer': 'https://www.chromastudio.ai/'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING MAGIC... (' + (polls + 1) + ')');
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // --- MAIN HANDLERS ---

    // Handler when file is selected - uploads immediately
    async function handleFileSelect(file) {
        if (!file) return;

        // Validation for image types
        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file (JPG, PNG).');
            return;
        }

        try {
            // Show loading state immediately
            switchState(stateProcessing);
            updateStatus('UPLOADING IMAGE...');
            
            // Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Setup previews
            imagePreview.src = uploadedUrl;
            resultOriginal.src = uploadedUrl; // For the side-by-side view later
            
            // Move to preview state
            switchState(statePreview);
            
            // Ensure generate button is ready
            generateBtn.disabled = false;
            
        } catch (error) {
            switchState(stateUpload); // Reset to upload screen
            showError('Upload failed: ' + error.message);
        }
    }

    // Handler when Generate button is clicked
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert("No image uploaded.");
            return;
        }
        
        try {
            switchState(stateProcessing);
            updateStatus('SUBMITTING JOB...');
            
            // Step 1: Submit job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('QUEUED...');
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            // Step 3: Get the result image URL
            const resultUrl = result.result?.[0]?.image;
            
            if (!resultUrl) {
                throw new Error('No image URL in response');
            }
            
            // Update current URL to result (for download logic if needed, though usually we download the result)
            // Note: Keep currentUploadedUrl as source if we want to re-run, 
            // but here we just show result.
            
            // Step 4: Display result
            resultFinal.src = resultUrl;
            
            switchState(stateResult);
            
            // Store result url on the download button for easy access
            downloadBtn.dataset.url = resultUrl;
            
        } catch (error) {
            switchState(statePreview); // Go back to preview on error
            showError(error.message);
        }
    }

    // --- EVENT LISTENERS ---

    // File Input
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFileSelect(e.dataTransfer.files[0]);
    });

    // Generate Action
    generateBtn.addEventListener('click', handleGenerate);

    // Reset Action
    resetBtn.addEventListener('click', () => {
        fileInput.value = '';
        currentUploadedUrl = null;
        imagePreview.src = '';
        resultFinal.src = '';
        switchState(stateUpload);
    });

    // Cancel Action (from Preview state)
    cancelBtn.addEventListener('click', () => {
        fileInput.value = '';
        currentUploadedUrl = null;
        switchState(stateUpload);
    });

    // Download Action - Real Download with CORS handling
    downloadBtn.addEventListener('click', async () => {
        const urlToDownload = downloadBtn.dataset.url || resultFinal.src;
        if (!urlToDownload) return;
        
        const originalBtnText = downloadBtn.textContent;
        downloadBtn.textContent = 'Downloading...';
        
        try {
            // Try fetch with CORS mode first
            const response = await fetch(urlToDownload, {
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (!response.ok) {
                throw new Error('Fetch failed: ' + response.status);
            }
            
            const blob = await response.blob();
            
            // Create download link
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'birthday_magic_' + generateNanoId(8) + '.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Cleanup after a short delay
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            
        } catch (err) {
            console.warn("Blob download failed, trying anchor download:", err);
            
            // Fallback: Try using anchor with download attribute directly
            // This works if the server sets Content-Disposition: attachment
            const link = document.createElement('a');
            link.href = urlToDownload;
            link.download = 'birthday_magic_' + generateNanoId(8) + '.png';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            
            // Try clicking the link
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // If still opens in new tab, show instructions
            setTimeout(() => {
                if (confirm('If the image opened in a new tab, right-click it and select "Save image as..." to download.\n\nOpen image in new tab?')) {
                    window.open(urlToDownload, '_blank');
                }
            }, 500);
        } finally {
            downloadBtn.textContent = originalBtnText;
        }
    });

    // --- UI ANIMATIONS & UTILS (PRESERVED) ---

    // Mobile Menu
    mobileToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const spans = mobileToggle.querySelectorAll('span');
        if (navLinks.classList.contains('active')) {
            spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
            spans[1].style.opacity = '0';
            spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
        } else {
            spans[0].style.transform = 'none';
            spans[1].style.opacity = '1';
            spans[2].style.transform = 'none';
        }
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
        });
    });

    // FAQ Accordion
    const accordions = document.querySelectorAll('.accordion-header');
    accordions.forEach(acc => {
        acc.addEventListener('click', () => {
            const item = acc.parentElement;
            document.querySelectorAll('.accordion-item').forEach(i => {
                if (i !== item) i.classList.remove('active');
            });
            item.classList.toggle('active');
        });
    });

    // Scroll Animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.step-card, .gallery-item, .hero-text-panel');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });
});