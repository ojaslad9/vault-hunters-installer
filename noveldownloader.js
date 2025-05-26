async function fetchNovelContent(url) {
    console.log("[fetchNovelContent] Starting", url);
    try {
        const response = await fetch(url);

        // Handle 403 (CAPTCHA) specifically by returning a 'captcha' status
        if (response.status === 403) {
            console.warn(`[fetchNovelContent] CAPTCHA (403) detected: ${url}`);
            return { status: 'captcha', url: url };
        }

        // Handle other non-OK responses (e.g., 500, 404)
        if (!response.ok) {
            console.error(
                `Server error: Failed to fetch content from ${url}. Status: ${response.status}`,
            );
            return { status: 'network_error', url: url, statusCode: response.status };
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Attempt to find the episode title using multiple selectors
        const titleSelectors = [
            ".toon-title",
            ".view-title",
            "h1.title",
            ".post-title",
            ".entry-title",
        ];

        let titleElement = null;
        for (const selector of titleSelectors) {
            titleElement = doc.querySelector(selector);
            if (titleElement) {
                console.log(`[fetchNovelContent] Title selector found: ${selector}`);
                break;
            }
        }

        let episodeTitle = "Untitled Episode";
        if (titleElement) {
            episodeTitle =
                titleElement.getAttribute("title") ||
                titleElement.textContent.split("<br>")[0].trim() ||
                "Untitled Episode";
            console.log("[fetchNovelContent] Extracted title:", episodeTitle);
        }

        // Attempt to find the main content using multiple selectors
        const contentSelectors = [
            "#novel_content",
            ".novel-content",
            ".view-content",
            ".entry-content",
            ".post-content",
        ];

        let content = null;
        for (const selector of contentSelectors) {
            content = doc.querySelector(selector);
            if (content) {
                console.log(`[fetchNovelContent] Content selector found: ${selector}`);
                break;
            }
        }

        // If no content element is found, return a specific status
        if (!content) {
            console.error(`Content not found: ${url}`);
            return { status: 'no_content_found', url: url };
        }

        // Clean and prepare the content
        let cleanedContent = cleanText(content.innerHTML);
        // Remove episode title from content if it's at the beginning
        if (cleanedContent.startsWith(episodeTitle)) {
            cleanedContent = cleanedContent.slice(episodeTitle.length).trim();
        }

        console.log(
            "[fetchNovelContent] Cleaned content (first 100 chars):",
            cleanedContent.slice(0, 100),
        );

        console.log("[fetchNovelContent] Finished", { episodeTitle });
        return {
            status: 'success',
            episodeTitle: episodeTitle,
            content: cleanedContent,
        };
    } catch (error) {
        // Catch any general fetch or parsing errors
        console.error(`fetchNovelContent error: ${error.message}`);
        return { status: 'fetch_error', url: url, message: error.message };
    }
}

/**
 * Unescapes HTML entities in a given text string.
 * @param {string} text - The text containing HTML entities.
 * @returns {string} The text with HTML entities unescaped.
 */
function unescapeHTML(text) {
    const entities = {
        "&lt;": "<",
        "&gt;": ">",
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&nbsp;": " ",
        "&ndash;": "-",
        "&mdash;": "--",
        "&lsquo;": "'",
        "&rsquo;": "'",
        "&ldquo;": '"',
        "&rdquo;": '"',
    };

    let result = text;
    for (const [entity, replacement] of Object.entries(entities)) {
        const regex = new RegExp(entity, "g");
        result = result.replace(regex, replacement);
    }

    return result;
}

/**
 * Cleans HTML content, removing tags, replacing breaks with newlines, and trimming whitespace.
 * @param {string} text - The HTML string to clean.
 * @returns {string} The cleaned plain text.
 */
function cleanText(text) {
    let cleaned = text;
    // Replace div and p tags with newlines
    cleaned = cleaned.replace(/<div>/g, "");
    cleaned = cleaned.replace(/<\/div>/g, "");
    cleaned = cleaned.replace(/<p>/g, "\n");
    cleaned = cleaned.replace(/<\/p>/g, "\n");
    // Replace br tags with newlines
    cleaned = cleaned.replace(/<br\s*[/]?>/g, "\n");
    // Replace img tags with a placeholder
    cleaned = cleaned.replace(/<img[^>]*>/gi, "[Image Skipped]");
    // Remove any remaining HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, "");
    // Replace multiple spaces with a single space
    cleaned = cleaned.replace(/ {2,}/g, " ");
    // Unescape HTML entities
    cleaned = unescapeHTML(cleaned);

    // Trim lines, filter empty lines, and join with double newlines
    cleaned = cleaned
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n\n")
        .replace(/\n{3,}/g, "\n\n"); // Collapse multiple newlines

    return cleaned;
}


// Part 2: Modal and Confirmation Dialogs

/**
 * Creates and displays a modal for showing download progress.
 * @param {string} title - The title of the modal.
 * @param {object} isBusyRef - A reference object to indicate if the download is busy (for close confirmation).
 * @returns {{modal: HTMLElement, statusElement: HTMLElement, progressText: HTMLElement, timeRemaining: HTMLElement, progressBar: HTMLElement, detailedProgress: HTMLElement, closeButton: HTMLElement}}
 * An object containing references to the modal elements.
 */
function createModal(title, isBusyRef) {
    // Add animation styles to the document if not already present
    if (!document.getElementById("novel-dl-styles")) {
        const style = document.createElement("style");
        style.id = "novel-dl-styles";
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes pulse {
                0% { opacity: 0.7; }
                50% { opacity: 1; }
                100% { opacity: 0.7; }
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .fab-button {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 60px;
                height: 60px;
                background-color: #3a7bd5;
                color: white;
                border: none;
                border-radius: 50%;
                font-size: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                transition: background-color 0.3s, transform 0.3s;
                z-index: 9990; /* Below modals, above page content */
            }
            .fab-button:hover {
                background-color: #2d62aa;
                transform: translateY(-2px);
            }
            .fab-button:active {
                transform: translateY(0);
                box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            }

            .fab-menu-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.6);
                z-index: 9995; /* Above FAB, below modals */
                display: flex;
                align-items: flex-end;
                justify-content: flex-end;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s, visibility 0.3s;
            }
            .fab-menu-overlay.active {
                opacity: 1;
                visibility: visible;
            }

            .fab-menu {
                background-color: #fff;
                border-radius: 12px;
                box-shadow: 0 6px 30px rgba(0,0,0,0.2);
                margin: 80px 20px 20px 20px; /* Adjust margin to avoid FAB */
                padding: 16px;
                width: 250px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                transform: translateY(20px);
                opacity: 0;
                transition: transform 0.3s, opacity 0.3s;
            }
            .fab-menu-overlay.active .fab-menu {
                transform: translateY(0);
                opacity: 1;
            }

            .fab-menu-item {
                padding: 12px 16px;
                font-size: 15px;
                color: #172238;
                cursor: pointer;
                border-radius: 8px;
                transition: background-color 0.2s, color 0.2s;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .fab-menu-item:hover {
                background-color: #f0f2f8;
                color: #3a7bd5;
            }
            .fab-menu-item svg {
                width: 20px;
                height: 20px;
                fill: currentColor; /* Use current text color for SVG */
            }
        `;
        document.head.appendChild(style);
    }

    // Create modal container
    const modal = document.createElement("div");
    modal.id = "downloadProgressModal";
    Object.assign(modal.style, {
        display: "flex",
        position: "fixed",
        zIndex: "9999",
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    });

    // Create modal content box
    const modalContent = document.createElement("div");
    Object.assign(modalContent.style, {
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        width: "450px",
        maxWidth: "90%",
        padding: "0",
        overflow: "hidden",
        animation: "fadeIn 0.3s",
    });

    // Create modal header
    const header = document.createElement("div");
    Object.assign(header.style, {
        backgroundColor: "#f9f9fb",
        borderBottom: "1px solid #eaecef",
        padding: "16px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    });

    // Add title to header
    const headerTitle = document.createElement("h3");
    headerTitle.textContent = title;
    Object.assign(headerTitle.style, {
        margin: "0",
        color: "#172238",
        fontSize: "16px",
        fontWeight: "600",
    });
    header.appendChild(headerTitle);

    // Add close button
    const closeButton = document.createElement("button");
    closeButton.innerHTML = "&times;";
    Object.assign(closeButton.style, {
        background: "none",
        border: "none",
        fontSize: "22px",
        cursor: "pointer",
        color: "#666",
        padding: "0 4px",
        lineHeight: "1",
    });
    // Initial close behavior (will be modified by download functions)
    closeButton.onclick = () => {
        if (isBusyRef?.value) {
            // Use a custom modal for confirmation instead of alert/confirm
            showConfirmationModal("Cancel Download", "Are you sure you want to cancel the download?", () => {
                document.body.removeChild(modal);
            });
        } else {
            document.body.removeChild(modal);
        }
    };
    header.appendChild(closeButton);

    modalContent.appendChild(header);

    // Create modal body
    const body = document.createElement("div");
    Object.assign(body.style, {
        padding: "20px",
    });
    modalContent.appendChild(body);

    // Create status element
    const statusElement = document.createElement("div");
    Object.assign(statusElement.style, {
        marginBottom: "16px",
        fontSize: "14px",
        color: "#444",
        fontWeight: "500",
    });
    body.appendChild(statusElement);

    // Create progress info elements
    const progressInfo = document.createElement("div");
    Object.assign(progressInfo.style, {
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "10px",
        fontSize: "14px",
        color: "#555",
    });

    const progressText = document.createElement("div");
    progressText.textContent = "0%";
    Object.assign(progressText.style, {
        fontWeight: "600",
    });
    progressInfo.appendChild(progressText);

    const timeRemaining = document.createElement("div");
    progressInfo.appendChild(timeRemaining);

    body.appendChild(progressInfo);

    // Create progress bar container
    const progressBarContainer = document.createElement("div");
    Object.assign(progressBarContainer.style, {
        width: "100%",
        height: "8px",
        backgroundColor: "#eaecef",
        borderRadius: "8px",
        overflow: "hidden",
    });

    // Create progress bar
    const progressBar = document.createElement("div");
    Object.assign(progressBar.style, {
        width: "0%",
        height: "100%",
        background: "linear-gradient(90deg, #3a7bd5, #6fa1ff)",
        borderRadius: "8px",
        transition: "width 0.3s ease",
    });

    progressBarContainer.appendChild(progressBar);
    body.appendChild(progressBarContainer);

    // Create detailed progress element
    const detailedProgress = document.createElement("div");
    Object.assign(detailedProgress.style, {
        marginTop: "16px",
        fontSize: "13px",
        color: "#666",
        textAlign: "center",
    });
    body.appendChild(detailedProgress);

    modal.appendChild(modalContent);

    return {
        modal,
        statusElement,
        progressText,
        timeRemaining,
        progressBar,
        detailedProgress,
        closeButton,
    };
}

/**
 * Creates a custom confirmation modal instead of using window.confirm.
 * @param {string} title - The title of the confirmation modal.
 * @param {string} message - The message to display.
 * @param {function} onConfirm - Callback function if user confirms.
 * @param {function} [onCancel] - Callback function if user cancels.
 */
function showConfirmationModal(title, message, onConfirm, onCancel) {
    const modal = document.createElement('div');
    Object.assign(modal.style, {
        position: 'fixed',
        zIndex: '10000',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    });

    const content = document.createElement('div');
    Object.assign(content.style, {
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 6px 30px rgba(0,0,0,0.2)',
        width: '380px',
        maxWidth: '90%',
        padding: '28px',
        textAlign: 'center',
        animation: 'fadeIn 0.3s',
    });

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
        margin: '0 0 16px 0',
        color: '#172238',
        fontSize: '18px',
        fontWeight: '600',
    });
    content.appendChild(titleEl);

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    Object.assign(messageEl.style, {
        color: '#555',
        fontSize: '14px',
        marginBottom: '28px',
    });
    content.appendChild(messageEl);

    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm';
    Object.assign(confirmBtn.style, {
        padding: '10px 20px',
        border: 'none',
        borderRadius: '8px',
        backgroundColor: '#4CAF50',
        color: 'white',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'background-color 0.2s',
    });
    confirmBtn.onmouseover = () => confirmBtn.style.backgroundColor = '#388E3C';
    confirmBtn.onmouseout = () => confirmBtn.style.backgroundColor = '#4CAF50';
    confirmBtn.onclick = () => {
        document.body.removeChild(modal);
        if (onConfirm) onConfirm();
    };
    buttonContainer.appendChild(confirmBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
        padding: '10px 20px',
        border: '1px solid #e4e9f0',
        borderRadius: '8px',
        backgroundColor: '#f9f9fb',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.2s ease',
    });
    cancelBtn.onmouseover = () => cancelBtn.style.backgroundColor = '#f0f2f8';
    cancelBtn.onmouseout = () => cancelBtn.style.backgroundColor = '#f9f9fb';
    cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        if (onCancel) onCancel();
    };
    buttonContainer.appendChild(cancelBtn);

    content.appendChild(buttonContainer);
    modal.appendChild(content);
    document.body.appendChild(modal);
}
// Part 3: Progress Tracking and Utility Functions

/**
 * Creates a progress tracker using a moving average for more accurate time estimation.
 * @param {number} totalItems - The total number of items to process.
 * @returns {{update: function(number): {progress: string, remaining: string, elapsed: string, speed: string}}}
 * An object with an update method to get current progress statistics.
 */
function createProgressTracker(totalItems) {
    const startTime = Date.now();
    const processingTimes = [];
    const MAX_SAMPLES = 5; // Use last 5 samples for moving average

    return {
        update: (completedItems) => {
            const progress = (completedItems / totalItems) * 100;

            const elapsed = Date.now() - startTime;

            // Calculate time per item and store for moving average
            if (completedItems > 0) {
                const currentTimePerItem = elapsed / completedItems;
                processingTimes.push(currentTimePerItem);

                // Keep only the most recent samples
                if (processingTimes.length > MAX_SAMPLES) {
                    processingTimes.shift();
                }
            }

            // Calculate moving average of processing time
            const avgTimePerItem =
                processingTimes.length > 0
                    ? processingTimes.reduce((sum, time) => sum + time, 0) /
                    processingTimes.length
                    : 0;

            // Calculate remaining time based on moving average
            const remainingItems = totalItems - completedItems;
            const estimatedRemainingTime = avgTimePerItem * remainingItems;

            return {
                progress: progress.toFixed(1),
                remaining: formatTime(estimatedRemainingTime),
                elapsed: formatTime(elapsed),
                speed: avgTimePerItem > 0 ? (1000 / avgTimePerItem).toFixed(2) : "0.00", // Items per second
            };
        },
    };
}

/**
 * Formats milliseconds into a human-readable time string (e.g., "1m 30s").
 * @param {number} ms - Time in milliseconds.
 * @returns {string} Formatted time string.
 */
function formatTime(ms) {
    if (ms < 60000) {
        return `${Math.ceil(ms / 1000)}s`;
    }
    if (ms < 3600000) {
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
}

/**
 * Dynamically loads a JavaScript script from a given URL.
 * @param {string} url - The URL of the script to load.
 * @returns {Promise<void>} A promise that resolves when the script is loaded.
 */
async function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.onload = resolve;
        script.onerror = () => {
            console.error(`Failed to load script: ${url}`);
            reject(new Error(`Failed to load script: ${url}`));
        };
        document.head.appendChild(script);
    });
}

/**
 * Sanitizes a string to be used as a filename, replacing invalid characters with underscores.
 * @param {string} name - The original string.
 * @returns {string} The sanitized filename.
 */
function sanitizeFilename(name) {
    return name.replace(/[/\\?%*:|"<>]/g, "_");
}

/**
 * Displays a small notification message at the bottom right of the screen.
 * @param {string} title - The title of the notification.
 * @param {string} message - The message content.
 */
function showNotification(title, message) {
    const notification = document.createElement("div");
    Object.assign(notification.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        backgroundColor: "#fff",
        borderLeft: "4px solid #4CAF50",
        borderRadius: "4px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: "16px",
        zIndex: "9999",
        maxWidth: "320px",
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        animation: "fadeIn 0.3s",
    });

    notification.innerHTML = `
        <div style="font-weight: 600; color: #172238; margin-bottom: 4px;">${title}</div>
        <div style="font-size: 13px; color: #666;">${message}</div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transition = "opacity 0.3s";
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 5000);
}

/**
 * Displays a native Chrome notification (if permission is granted).
 * @param {string} title - The title of the notification.
 * @param {string} message - The message content.
 */
function showChromeNotification(title, message) {
    if (!("Notification" in window)) {
        console.log("[showChromeNotification] This browser does not support desktop notifications.");
        return;
    }

    if (Notification.permission === "granted") {
        const notification = new Notification(title, {
            body: message,
            icon: "https://raw.githubusercontent.com/yeorinhieut/novel-dl/main/icon.png"
        });

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
    }
    else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                const notification = new Notification(title, {
                    body: message,
                    icon: "https://raw.githubusercontent.com/yeorinhieut/novel-dl/main/main/icon.png"
                });

                // Auto-close after 5 seconds
                setTimeout(() => notification.close(), 5000);
            }
        });
    }
}


// Part 4: Core Download Logic

/**
 * Core function to process and download novel chapters.
 * This function handles both initial full downloads and retries from a report file.
 * @param {string} title - The title of the novel.
 * @param {Array<string>} episodeUrlsToProcess - An array of episode URLs to download.
 * @param {number} delayMs - Delay between fetches in milliseconds.
 * @param {boolean} saveAsZip - True to save as a ZIP file, false for a single text file.
 * @param {string} [originalFileNameForReport] - Optional. If retrying, the name of the original report file.
 * @param {number} [initialStartEpisode] - Optional. For initial full download, the starting episode number.
 * @param {number} [initialEndEpisode] - Optional. For initial full download, the ending episode number.
 */
async function processDownloadCore(
    title,
    episodeUrlsToProcess,
    delayMs,
    saveAsZip,
    originalFileNameForReport = '',
    initialStartEpisode,
    initialEndEpisode
) {
    console.log("[processDownloadCore] Starting", {
        title,
        saveAsZip,
        delayMs,
        episodeUrlsCount: episodeUrlsToProcess.length,
        originalFileNameForReport,
        initialStartEpisode,
        initialEndEpisode
    });

    let zip;
    if (saveAsZip) {
        try {
            await loadScript(
                "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
            );
                      // Add a robust check to ensure JSZip is defined after loading
            const MAX_WAIT_TIME = 5000; // Maximum time to wait for JSZip to be defined (5 seconds)
            const CHECK_INTERVAL = 100; // Check every 100 ms
            let elapsedWaitTime = 0;

            console.log("[processDownloadCore] Verifying JSZip availability...");
            while (typeof window.JSZip === 'undefined' && elapsedWaitTime < MAX_WAIT_TIME) {
                await new Promise(r => setTimeout(r, CHECK_INTERVAL));
                elapsedWaitTime += CHECK_INTERVAL;
            }

            if (typeof window.JSZip === 'undefined') {
                throw new Error("JSZip did not become defined within the expected time.");
            }

            zip = new JSZip();
            console.log("[processDownloadCore] JSZip loaded successfully.");
        } catch (e) {
            console.error("[processDownloadCore] JSZip failed to load:", e);
            showNotification(
                e.message +
                "ZIP Library Load Failed",
                "Cannot compress files into a ZIP. Please check your internet connection or try again later. The download will proceed as a single text file if possible, otherwise it will be cancelled."
            );
            // If JSZip fails to load, we cannot save as ZIP. Fallback or cancel.
            // For now, let's cancel to prevent unexpected behavior.
            return;
        }
    }

    const totalEpisodesCount = episodeUrlsToProcess.length;

    const isBusyRef = { value: true }; // Used by createModal for cancellation confirmation
    const {
        modal,
        statusElement,
        progressText,
        timeRemaining,
        progressBar,
        detailedProgress,
        closeButton
    } = createModal(`Downloading "${title}"`, isBusyRef);

    document.body.appendChild(modal);

    let isDownloadCancelled = false; // Flag to allow cancellation mid-download

    // Modify close button behavior for busy state
    closeButton.onclick = () => {
        showConfirmationModal("Cancel Download", "Are you sure you want to cancel the download?", () => {
            isDownloadCancelled = true; // Set flag to stop the loop
            document.body.removeChild(modal);
        });
    };

    // Progress tracker initialization
    const progressTracker = createProgressTracker(totalEpisodesCount);
    let novelText = `${title}\n\nDownloaded with novel-dl,\nhttps://github.com/yeorinhieut/novel-dl\n\n`;
    let completedEpisodes = 0;
    let skippedChapters = []; // For 403 (captcha)
    let incompleteChapters = []; // For network errors, no content, or abrupt ending

    statusElement.textContent = "Preparing download...";

    for (let i = 0; i < episodeUrlsToProcess.length; i++) {
        if (isDownloadCancelled) {
            console.log("[processDownloadCore] Download cancelled by user.");
            break; // Exit loop if cancelled
        }

        const episodeUrl = episodeUrlsToProcess[i];
        // For initial download, we can derive the episode number. For retries, it's just the URL index.
        const displayEpisodeNumber = (initialStartEpisode !== undefined && initialEndEpisode !== undefined)
            ? (episodeUrlsToProcess.length - 1 - i) + initialStartEpisode // This logic needs to be verified based on how episodeLinks are ordered.
            : `Link ${i + 1}`; // For retries, just show link number

        const currentProgressCount = i + 1;

        statusElement.textContent = `Downloading Chapter ${displayEpisodeNumber}... (${currentProgressCount}/${totalEpisodesCount})`;

        const result = await fetchNovelContent(episodeUrl);

        if (result.status === 'success') {
            const { episodeTitle: fetchedEpisodeTitle, content } = result;
            console.log(`[processDownloadCore] Episode download successful: ${fetchedEpisodeTitle}`);

            if (saveAsZip) {
                zip.file(`${sanitizeFilename(fetchedEpisodeTitle)}.txt`, content);
            } else {
                novelText += `\n\n--- ${fetchedEpisodeTitle} ---\n\n${content}`;
            }
            completedEpisodes++;
        } else if (result.status === 'captcha') {
            console.warn(`[processDownloadCore] CAPTCHA (403) detected, skipping: ${episodeUrl}`);
            skippedChapters.push({ url: episodeUrl, reason: 'CAPTCHA (403)' });
        } else if (result.status === 'network_error') {
            console.error(`[processDownloadCore] Network error (${result.statusCode}), skipping: ${episodeUrl}`);
            incompleteChapters.push({ url: episodeUrl, reason: `Network Error (${result.statusCode})` });
        } else if (result.status === 'no_content_found') {
            console.error(`[processDownloadCore] No content found, skipping: ${episodeUrl}`);
            incompleteChapters.push({ url: episodeUrl, reason: 'No Content Found' });
        } else if (result.status === 'fetch_error') {
            console.error(`[processDownloadCore] Fetch error, skipping: ${episodeUrl} - ${result.message}`);
            incompleteChapters.push({ url: episodeUrl, reason: `Fetch Error: ${result.message}` });
        }

        const stats = progressTracker.update(currentProgressCount);

        progressBar.style.width = `${stats.progress}%`;
        progressText.textContent = `${stats.progress}%`;
        timeRemaining.textContent = `Time Remaining: ${stats.remaining}`;

        detailedProgress.innerHTML = `
            <div style="margin-bottom: 4px; display: flex; justify-content: center; gap: 12px;">
                <span>✅ Completed: ${completedEpisodes} Chapters</span>
                <span>❌ Skipped: ${skippedChapters.length} Chapters</span>
                <span>⚠️ Incomplete: ${incompleteChapters.length} Chapters</span>
            </div>
            <div>Elapsed Time: ${stats.elapsed} | Processing Speed: ${stats.speed} Ch/s</div>
        `;

        // Add configurable delay to prevent rate limiting
        await new Promise((r) => setTimeout(r, delayMs));
    }

    isBusyRef.value = false; // Download finished or cancelled

    console.log("[processDownloadCore] Download loop finished", {
        completedEpisodes,
        skippedChaptersCount: skippedChapters.length,
        incompleteChaptersCount: incompleteChapters.length,
    });

    if (isDownloadCancelled) {
        statusElement.textContent = "Download Cancelled.";
        showNotification("Download Cancelled", "The download was cancelled by the user.");
        document.body.removeChild(modal);
        return;
    }

    statusElement.textContent = "✅ Download Complete, generating file...";
    progressBar.style.width = "100%";
    progressText.textContent = "100%";

    // Generate the skipped/incomplete chapters report
    let reportContent = `--- Skipped Chapters (CAPTCHA / 403) ---\n`;
    if (skippedChapters.length > 0) {
        reportContent += skippedChapters.map(item => `URL: ${item.url} (Reason: ${item.reason})`).join('\n') + '\n';
    } else {
        reportContent += 'No chapters skipped due to CAPTCHA.\n';
    }

    reportContent += `\n--- Incomplete/Failed Chapters ---\n`;
    if (incompleteChapters.length > 0) {
        reportContent += incompleteChapters.map(item => `URL: ${item.url} (Reason: ${item.reason})`).join('\n') + '\n';
    } else {
        reportContent += 'No chapters incomplete or failed.\n';
    }

    const reportFileName = `${sanitizeFilename(title)}${originalFileNameForReport ? `_retry_of_${sanitizeFilename(originalFileNameForReport)}` : ''}_report.txt`;

    if (saveAsZip) {
        zip.file(reportFileName, reportContent);
    } else {
        // If not saving as zip, create a separate blob for the report
        const reportBlob = new Blob([reportContent], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(reportBlob);
        a.download = reportFileName;
        a.click();
    }

    setTimeout(() => {
        console.log("[processDownloadCore] File generation and download button displayed.");
        document.body.removeChild(modal);

        // Create completion dialog
        const completionDialog = document.createElement("div");
        Object.assign(completionDialog.style, {
            position: "fixed",
            zIndex: "9999",
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        });

        const completionContent = document.createElement("div");
        Object.assign(completionContent.style, {
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            width: "400px",
            maxWidth: "90%",
            padding: "24px",
            animation: "fadeIn 0.3s",
            textAlign: "center",
        });

        // Success icon
        const successIcon = document.createElement("div");
        successIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        `;
        Object.assign(successIcon.style, {
            display: "flex",
            justifyContent: "center",
            marginBottom: "16px",
        });
        completionContent.appendChild(successIcon);

        // Completion title
        const completionTitle = document.createElement("h3");
        completionTitle.textContent = "Download Complete!";
        Object.assign(completionTitle.style, {
            color: "#172238",
            fontSize: "18px",
            margin: "0 0 8px 0",
        });
        completionContent.appendChild(completionTitle);

        // Completion message with summary of skipped/incomplete
        const completionMessage = document.createElement("p");
        completionMessage.innerHTML = `${completedEpisodes} chapters are ready for download.<br>
        ${skippedChapters.length > 0 ? `⚠️ ${skippedChapters.length} skipped (CAPTCHA)` : ''}<br>
        ${incompleteChapters.length > 0 ? `❌ ${incompleteChapters.length} incomplete/failed` : ''}
        `;
        Object.assign(completionMessage.style, {
            color: "#666",
            margin: "0 0 24px 0",
            fontSize: "14px",
        });
        completionContent.appendChild(completionMessage);

        // Download button
        const downloadBtn = document.createElement("button");
        downloadBtn.textContent = "Download";
        Object.assign(downloadBtn.style, {
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            padding: "12px 24px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
            marginBottom: "24px",
            width: "100%",
            transition: "background-color 0.2s",
        });

        downloadBtn.onmouseover = () => {
            downloadBtn.style.backgroundColor = "#388E3C";
        };

        downloadBtn.onmouseout = () => {
            downloadBtn.style.backgroundColor = "#4CAF50";
        };

        downloadBtn.onclick = () => {
            if (saveAsZip) {
                zip.generateAsync({ type: "blob" }).then((blob) => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${sanitizeFilename(title)}.zip`;
                    a.click();

                    showNotification(
                        `Starting "${title}" Download`,
                        `${completedEpisodes} chapters will be saved as a ZIP file containing individual text files.`,
                    );
                    showChromeNotification(
                        `Starting "${title}" Download`,
                        `${completedEpisodes} chapters will be saved as a ZIP file containing individual text files.`,
                    );
                    document.body.removeChild(completionDialog);
                });
            } else {
                const blob = new Blob([novelText], { type: "text/plain" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${sanitizeFilename(title)}${initialStartEpisode !== undefined ? `(${initialStartEpisode}~${initialEndEpisode})` : ''}.txt`;
                a.click();

                showNotification(
                    `Starting "${title}" Download`,
                    `${completedEpisodes} chapters will be saved as a single text file.`,
                );
                showChromeNotification(
                    `Starting "${title}" Download`,
                    `${completedEpisodes} chapters will be saved as a single text file.`,
                );
                document.body.removeChild(completionDialog);
            }
        };

        completionContent.appendChild(downloadBtn);

        // Contact links (re-using existing structure for consistency)
        const contactContainer = document.createElement("div");
        Object.assign(contactContainer.style, {
            marginTop: "16px",
            textAlign: "center",
            fontSize: "13px",
        });

        const contactLink = document.createElement("a");
        contactLink.href = "mailto:yeorinhieut@gmail.com";
        contactLink.textContent = "Contact Developer";
        Object.assign(contactLink.style, {
            color: "#666",
            textDecoration: "none",
            borderBottom: "1px dotted #999",
        });

        contactLink.onmouseover = () => {
            contactLink.style.color = "#3a7bd5";
            contactLink.style.borderBottom = "1px dotted #3a7bd5";
        };

        contactLink.onmouseout = () => {
            contactLink.style.color = "#666";
            contactLink.style.borderBottom = "1px dotted #999";
        };

        contactContainer.appendChild(contactLink);

        const separator = document.createElement("span");
        separator.textContent = " · ";
        separator.style.color = "#999";
        contactContainer.appendChild(separator);

        const issueLink = document.createElement("a");
        issueLink.href = "https://github.com/yeorinhieut/novel-dl/issues";
        issueLink.textContent = "Report an Issue";
        issueLink.target = "_blank";
        Object.assign(issueLink.style, {
            color: "#666",
            fontSize: "13px",
            textDecoration: "none",
            borderBottom: "1px dotted #999",
        });

        issueLink.onmouseover = () => {
            issueLink.style.color = "#3a7bd5";
            issueLink.style.borderBottom = "1px dotted #3a7bd5";
        };

        issueLink.onmouseout = () => {
            issueLink.style.color = "#666";
            issueLink.style.borderBottom = "1px dotted #999";
        };

        contactContainer.appendChild(issueLink);
        completionContent.appendChild(contactContainer); // Append contact container to completion content

        completionDialog.appendChild(completionContent);
        document.body.appendChild(completionDialog);
    }, 500);
}

/**
 * Initiates the novel download process by showing the save option dialog.
 * This is the entry point for a new download.
 * @param {string} title - The title of the novel.
 * @param {Array<string>} episodeLinks - All available episode links.
 * @param {number} startEpisode - The starting episode number for the download range.
 * @param {number} endEpisode - The ending episode number for the download range.
 * @param {number} delayMs - Delay between fetches in milliseconds.
 */
async function downloadNovel(
    title,
    episodeLinks,
    startEpisode,
    endEpisode,
    delayMs = 5000,
) {
    console.log("[downloadNovel] Starting", {
        title,
        startEpisode,
        endEpisode,
        delayMs,
    });

    // Create and show the save option dialog
    const dialog = document.createElement("div");
    Object.assign(dialog.style, {
        position: "fixed",
        zIndex: "9999",
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    });

    const dialogContent = document.createElement("div");
    Object.assign(dialogContent.style, {
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        width: "350px",
        maxWidth: "90%",
        padding: "24px",
        animation: "fadeIn 0.3s",
    });

    const dialogTitle = document.createElement("h3");
    dialogTitle.textContent = "Select Save Method";
    Object.assign(dialogTitle.style, {
        margin: "0 0 20px 0",
        color: "#172238",
        fontSize: "18px",
        fontWeight: "600",
    });
    dialogContent.appendChild(dialogTitle);

    const optionsContainer = document.createElement("div");
    Object.assign(optionsContainer.style, {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        marginBottom: "24px",
    });

    // Helper function to create option buttons
    const createOption = (value, text, description) => {
        const option = document.createElement("div");
        Object.assign(option.style, {
            padding: "14px",
            border: "1px solid #e4e9f0",
            borderRadius: "8px",
            cursor: "pointer",
            backgroundColor: "#f9f9fb",
            transition: "all 0.2s ease",
        });

        option.innerHTML = `
            <div style="font-weight: 600; color: #172238; margin-bottom: 4px;">${text}</div>
            <div style="font-size: 13px; color: #666;">${description}</div>
        `;

        option.onclick = () => {
            document.body.removeChild(dialog);
            // Call the core processing function with the determined save type
            // Determine the actual URLs to process based on start/end episode
            const startingIndex = episodeLinks.length - startEpisode;
            const endingIndex = episodeLinks.length - endEpisode;
            const urlsToDownload = [];
            for (let i = startingIndex; i >= endingIndex; i--) {
                // Ensure only booktoki URLs are processed initially
                if (episodeLinks[i].startsWith("https://booktoki")) {
                    urlsToDownload.push(episodeLinks[i]);
                } else {
                    console.warn(`[downloadNovel] Skipping non-booktoki URL: ${episodeLinks[i]}`);
                }
            }
            processDownloadCore(title, urlsToDownload, delayMs, value !== "1", null, startEpisode, endEpisode);
        };

        option.onmouseover = () => {
            option.style.backgroundColor = "#f0f2f8";
            option.style.borderColor = "#3a7bd5";
        };

        option.onmouseout = () => {
            option.style.backgroundColor = "#f9f9fb";
            option.style.borderColor = "#e4e9f0";
        };

        return option;
    };

    optionsContainer.appendChild(
        createOption(
            "1",
            "Merge into One File",
            "All chapters will be saved into a single text file.",
        ),
    );
    optionsContainer.appendChild(
        createOption(
            "2",
            "Save Each Chapter (ZIP)",
            "Each chapter will be saved as an individual text file within a ZIP archive.",
        ),
    );

    dialogContent.appendChild(optionsContainer);

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    Object.assign(cancelButton.style, {
        width: "100%",
        padding: "10px",
        border: "1px solid #e4e9f0",
        borderRadius: "8px",
        backgroundColor: "#f9f9fb",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        transition: "all 0.2s ease",
    });

    cancelButton.onmouseover = () => {
        cancelButton.style.backgroundColor = "#f0f2f8";
    };

    cancelButton.onmouseout = () => {
        cancelButton.style.backgroundColor = "#f9f9fb";
    };

    cancelButton.onclick = () => {
        document.body.removeChild(dialog);
    };

    dialogContent.appendChild(cancelButton);

    // Add contact/issue links
    const contactContainer = document.createElement("div");
    Object.assign(contactContainer.style, {
        marginTop: "16px",
        textAlign: "center",
        fontSize: "13px",
    });

    const contactLink = document.createElement("a");
    contactLink.href = "mailto:yeorinhieut@gmail.com";
    contactLink.textContent = "Contact Developer";
    Object.assign(contactLink.style, {
        color: "#666",
        textDecoration: "none",
        borderBottom: "1px dotted #999",
    });

    contactLink.onmouseover = () => {
        contactLink.style.color = "#3a7bd5";
        contactLink.style.borderBottom = "1px dotted #3a7bd5";
    };

    contactLink.onmouseout = () => {
        contactLink.style.color = "#666";
        contactLink.style.borderBottom = "1px dotted #999";
    };

    contactContainer.appendChild(contactLink);

    const separator = document.createElement("span");
    separator.textContent = " · ";
    separator.style.color = "#999";
    contactContainer.appendChild(separator);

    const issueLink = document.createElement("a");
    issueLink.href = "https://github.com/yeorinhieut/novel-dl/issues";
    issueLink.textContent = "Report an Issue";
    issueLink.target = "_blank";
    Object.assign(issueLink.style, {
        color: "#666",
        fontSize: "13px",
        textDecoration: "none",
        borderBottom: "1px dotted #999",
    });

    issueLink.onmouseover = () => {
        issueLink.style.color = "#3a7bd5";
        issueLink.style.borderBottom = "1px dotted #3a7bd5";
    };

    issueLink.onmouseout = () => {
        issueLink.style.color = "#666";
        issueLink.style.borderBottom = "1px dotted #999";
    };

    contactContainer.appendChild(issueLink);
    dialogContent.appendChild(contactContainer);

    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);
}


// Part 5: Crawler Functions

/**
 * Extracts the novel title from the current page using XPath.
 * @returns {string|null} The extracted title or null if not found.
 */
function extractTitle() {
    const titleElement = document.evaluate(
        '//*[@id="content_wrapper"]/div[1]/span',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
    ).singleNodeValue;
    return titleElement ? titleElement.textContent.trim() : null;
}

/**
 * Extracts all episode links from the current page.
 * @returns {Array<string>} An array of episode URLs.
 */
function extractEpisodeLinks() {
    const episodeLinks = [];
    const links = document.querySelectorAll(".item-subject");

    for (const link of links) {
        const episodeLink = link.getAttribute("href");
        episodeLinks.push(episodeLink);
    }

    return episodeLinks;
}

/**
 * Fetches an HTML page and parses it into a DOM document.
 * @param {string} url - The URL of the page to fetch.
 * @returns {Promise<Document|null>} The parsed DOM document or null if fetching fails.
 */
async function fetchPage(url) {
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`Failed to fetch page: ${url}. Status: ${response.status}`);
        return null;
    }
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return doc;
}

/**
 * Main function to run the novel crawler and initiate download options.
 */
async function runCrawler() {
    console.log("[runCrawler] Starting");
    const novelPageRule = "https://booktoki";
    let currentUrl = window.location.href;

    // Clean URL by removing query parameters
    const urlParts = currentUrl.split("?")[0];
    currentUrl = urlParts;

    console.log("[runCrawler] Current URL:", currentUrl);

    if (!currentUrl.startsWith(novelPageRule)) {
        showNotification("Invalid Page", "This script must be run on a BookToki novel list page.");
        console.log("[runCrawler] Not a BookToki page, exiting.");
        return;
    }

    const title = extractTitle();
    console.log("[runCrawler] Extracted title:", title);

    if (!title) {
        showNotification("Title Extraction Failed", "Could not extract novel title.");
        console.log("[runCrawler] Title extraction failed, exiting.");
        return;
    }

    // Initial setup dialog for pages and options
    const dialog = document.createElement("div");
    Object.assign(dialog.style, {
        position: "fixed",
        zIndex: "9999",
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    });

    const dialogContent = document.createElement("div");
    Object.assign(dialogContent.style, {
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        width: "400px",
        maxWidth: "90%",
        padding: "24px",
        animation: "fadeIn 0.3s",
    });

    const dialogTitle = document.createElement("h3");
    dialogTitle.textContent = `Download Settings for "${title}"`;
    Object.assign(dialogTitle.style, {
        margin: "0 0 20px 0",
        color: "#172238",
        fontSize: "18px",
        fontWeight: "600",
    });
    dialogContent.appendChild(dialogTitle);

    /**
     * Helper function to create an input group with label, input, and error message.
     * @param {string} labelText - Text for the input label.
     * @param {string} inputType - Type of the input (e.g., "number", "text").
     * @param {string} defaultValue - Default value for the input.
     * @param {string} placeholder - Placeholder text for the input.
     * @param {string} description - Descriptive text for the input.
     * @param {function(string): string|null} validator - Function to validate input, returns error message or null.
     * @returns {{group: HTMLElement, input: HTMLInputElement, errorDiv: HTMLElement}}
     */
    function createInputGroup(
        labelText,
        inputType,
        defaultValue,
        placeholder,
        description,
        validator,
    ) {
        const group = document.createElement("div");
        Object.assign(group.style, {
            marginBottom: "20px",
        });

        const label = document.createElement("label");
        label.textContent = labelText;
        Object.assign(label.style, {
            display: "block",
            marginBottom: "8px",
            fontSize: "14px",
            color: "#444",
            fontWeight: "500",
        });
        group.appendChild(label);

        if (description) {
            const desc = document.createElement("div");
            desc.textContent = description;
            Object.assign(desc.style, {
                fontSize: "13px",
                color: "#666",
                marginBottom: "8px",
            });
            group.appendChild(desc);
        }

        const input = document.createElement("input");
        input.type = inputType;
        input.value = defaultValue;
        input.placeholder = placeholder || "";
        Object.assign(input.style, {
            width: "100%",
            padding: "10px",
            border: "1px solid #e4e9f0",
            borderRadius: "8px",
            fontSize: "14px",
            boxSizing: "border-box",
        });
        group.appendChild(input);

        // Error message div
        const errorDiv = document.createElement("div");
        errorDiv.className = "error-message";
        Object.assign(errorDiv.style, {
            color: "#e74c3c",
            fontSize: "12px",
            height: "16px",
            marginTop: "4px",
            display: "block",
        });
        group.appendChild(errorDiv);

        // Real-time validation on input
        if (validator) {
            input.addEventListener("input", () => {
                const msg = validator(input.value);
                errorDiv.textContent = msg || "";
                if (msg) {
                    input.style.borderColor = "#e74c3c";
                } else {
                    input.style.borderColor = "#e4e9f0";
                }
            });
        }

        return { group, input, errorDiv };
    }

    // Pages input
    const pagesInput = createInputGroup(
        "Number of Novel List Pages",
        "number",
        "1",
        "Enter number of pages",
        "Enter 1 if under 1000 chapters, 2 or more otherwise.",
        (value) => {
            if (Number.isNaN(Number(value)) || Number(value) < 1) {
                return "Please enter a valid number of pages.";
            }
            return null;
        },
    );
    dialogContent.appendChild(pagesInput.group);
    pagesInput.input.min = 1;

    // Button container
    const buttonsContainer = document.createElement("div");
    Object.assign(buttonsContainer.style, {
        display: "flex",
        justifyContent: "space-between",
        marginTop: "16px",
        gap: "12px",
    });

    // Cancel button
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    Object.assign(cancelButton.style, {
        flex: "1",
        padding: "10px",
        border: "1px solid #e4e9f0",
        borderRadius: "8px",
        backgroundColor: "#f9f9fb",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        transition: "all 0.2s ease",
    });

    cancelButton.onmouseover = () => {
        cancelButton.style.backgroundColor = "#f0f2f8";
    };

    cancelButton.onmouseout = () => {
        cancelButton.style.backgroundColor = "#f9f9fb";
    };

    cancelButton.onclick = () => document.body.removeChild(dialog);
    buttonsContainer.appendChild(cancelButton);

    // Continue button
    const continueButton = document.createElement("button");
    continueButton.textContent = "Continue";
    Object.assign(continueButton.style, {
        flex: "1",
        padding: "10px",
        border: "none",
        borderRadius: "8px",
        backgroundColor: "#3a7bd5",
        color: "white",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        transition: "all 0.2s ease",
    });

    continueButton.onmouseover = () => {
        continueButton.style.backgroundColor = "#2d62aa";
    };

    continueButton.onmouseout = () => {
        continueButton.style.backgroundColor = "#3a7bd5";
    };

    buttonsContainer.appendChild(continueButton);

    dialogContent.appendChild(buttonsContainer);
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    // Continue button click handler
    continueButton.onclick = async () => {
        const totalPages = Number.parseInt(pagesInput.input.value, 10);
        console.log("[runCrawler] User input pages:", totalPages);

        if (Number.isNaN(totalPages) || totalPages < 1) {
            showNotification("Invalid Input", "Please enter a valid number of pages.");
            console.log("[runCrawler] Invalid page count input, exiting.");
            return;
        }

        document.body.removeChild(dialog);

        // Show loading dialog
        const loadingDialog = document.createElement("div");
        Object.assign(loadingDialog.style, {
            position: "fixed",
            zIndex: "9999",
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        });

        const loadingContent = document.createElement("div");
        Object.assign(loadingContent.style, {
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            width: "300px",
            maxWidth: "90%",
            padding: "24px",
            textAlign: "center",
        });

        const loadingTitle = document.createElement("h3");
        loadingTitle.textContent = "Loading Episode List";
        Object.assign(loadingTitle.style, {
            margin: "0 0 16px 0",
            color: "#172238",
            fontSize: "16px",
            fontWeight: "600",
        });
        loadingContent.appendChild(loadingTitle);

        const loadingText = document.createElement("p");
        loadingText.textContent = "Please wait...";
        Object.assign(loadingText.style, {
            margin: "0 0 20px 0",
            fontSize: "14px",
            color: "#555",
        });
        loadingContent.appendChild(loadingText);

        // Dynamically add CSS for loading animation
        if (!document.getElementById("custom-spinner-style")) {
            const style = document.createElement("style");
            style.id = "custom-spinner-style";
            style.textContent = `
				@keyframes custom-spin {
					0% { transform: rotate(0deg); }
					100% { transform: rotate(360deg); }
				}
				.custom-spinner {
					width: 32px;
					height: 32px;
					border: 3px solid #f3f3f3;
					border-top: 3px solid #3a7bd5;
					border-radius: 50%;
					animation: custom-spin 1s linear infinite;
				}
			`;
            document.head.appendChild(style);
        }

        // Create loading animation
        const spinnerContainer = document.createElement("div");
        Object.assign(spinnerContainer.style, {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: "16px",
        });

        const spinner = document.createElement("div");
        spinner.className = "custom-spinner";

        spinnerContainer.appendChild(spinner);
        loadingContent.appendChild(spinnerContainer);

        loadingDialog.appendChild(loadingContent);
        document.body.appendChild(loadingDialog);

        // Fetch all episode links with progress updates
        const allEpisodeLinks = [];
        for (let page = 1; page <= totalPages; page++) {
            loadingText.textContent = `Loading page ${page}/${totalPages}...`;
            const nextPageUrl = `${currentUrl}?spage=${page}`;
            console.log(`[runCrawler] Fetching page ${page} URL:`, nextPageUrl);
            const nextPageDoc = await fetchPage(nextPageUrl);
            if (nextPageDoc) {
                const nextPageLinks = Array.from(
                    nextPageDoc.querySelectorAll(".item-subject"),
                ).map((link) => link.getAttribute("href"));
                console.log(
                    `[runCrawler] Page ${page} episode links count:`,
                    nextPageLinks.length,
                );
                allEpisodeLinks.push(...nextPageLinks);
                loadingText.textContent = `${allEpisodeLinks.length} episodes found.`;
            } else {
                console.log(`[runCrawler] Failed to load page ${page}`);
            }
            // Small delay to prevent rate limiting
            await new Promise((r) => setTimeout(r, 500));
        }

        console.log("[runCrawler] Total episode links found:", allEpisodeLinks.length);

        document.body.removeChild(loadingDialog);

        if (allEpisodeLinks.length === 0) {
            showNotification("No Episodes Found", "Could not retrieve episode list.");
            console.log("[runCrawler] No episode links found, exiting.");
            return;
        }

        // Episode range dialog
        const rangeDialog = document.createElement("div");
        Object.assign(rangeDialog.style, {
            position: "fixed",
            zIndex: "9999",
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        });

        const rangeContent = document.createElement("div");
        Object.assign(rangeContent.style, {
            backgroundColor: "#fff",
            borderRadius: "12px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            width: "400px",
            maxWidth: "90%",
            padding: "24px",
            animation: "fadeIn 0.3s",
        });

        const rangeTitle = document.createElement("h3");
        rangeTitle.textContent = "Set Download Range";
        Object.assign(rangeTitle.style, {
            margin: "0 0 16px 0",
            color: "#172238",
            fontSize: "18px",
            fontWeight: "600",
        });
        rangeContent.appendChild(rangeTitle);

        const episodeCount = document.createElement("div");
        episodeCount.innerHTML = `<span style="display: inline-block; background-color: #ebf5ff; color: #3a7bd5; padding: 4px 8px; border-radius: 4px; font-weight: 500;">Total ${allEpisodeLinks.length} chapters found.</span>`;
        Object.assign(episodeCount.style, {
            margin: "0 0 20px 0",
            fontSize: "14px",
        });
        rangeContent.appendChild(episodeCount);

        // Start episode input
        const startInput = createInputGroup(
            "Start Chapter",
            "number",
            "1",
            "Start chapter number",
            "Starts from 1.",
            (value) => {
                if (Number.isNaN(Number(value)) || Number(value) < 1) {
                    return "Please enter a valid chapter number.";
                }
                return null;
            },
        );
        rangeContent.appendChild(startInput.group);
        startInput.input.min = 1;
        startInput.input.max = allEpisodeLinks.length;

        // End episode input
        const endInput = createInputGroup(
            "End Chapter",
            "number",
            allEpisodeLinks.length.toString(),
            "End chapter number",
            "Enter the last chapter number.",
            (value) => {
                if (
                    Number.isNaN(Number(value)) ||
                    Number(value) < 1 ||
                    Number(value) > allEpisodeLinks.length
                ) {
                    return "Please enter a valid chapter number.";
                }
                return null;
            },
        );
        rangeContent.appendChild(endInput.group);
        endInput.input.min = 1;
        endInput.input.max = allEpisodeLinks.length;

        // Delay input with warning
        const delayInput = createInputGroup(
            "Delay (milliseconds)",
            "number",
            "5000",
            "Enter delay",
            "⚠️ Recommended: Keep default (5000ms=5s). Changing may lead to blocking.",
            (value) => {
                if (Number.isNaN(Number(value)) || Number(value) < 1000) {
                    return "Please enter a valid delay value (minimum 1000ms).";
                }
                return null;
            },
        );
        rangeContent.appendChild(delayInput.group);
        delayInput.input.min = 1000;
        delayInput.input.style.border = "1px solid #ffcc00";
        delayInput.input.style.backgroundColor = "#fffbf0";

        // Range buttons
        const rangeButtons = document.createElement("div");
        Object.assign(rangeButtons.style, {
            display: "flex",
            justifyContent: "space-between",
            marginTop: "20px",
            gap: "12px",
        });

        // Cancel button for range dialog
        const rangeCancelButton = document.createElement("button");
        rangeCancelButton.textContent = "Cancel";
        Object.assign(rangeCancelButton.style, {
            flex: "1",
            padding: "10px",
            border: "1px solid #e4e9f0",
            borderRadius: "8px",
            backgroundColor: "#f9f9fb",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
            transition: "all 0.2s ease",
        });

        rangeCancelButton.onmouseover = () => {
            rangeCancelButton.style.backgroundColor = "#f0f2f8";
        };

        rangeCancelButton.onmouseout = () => {
            rangeCancelButton.style.backgroundColor = "#f9f9fb";
        };

        rangeCancelButton.onclick = () => document.body.removeChild(rangeDialog);
        rangeButtons.appendChild(rangeCancelButton);

        // Download button
        const downloadButton = document.createElement("button");
        downloadButton.textContent = "Download";
        Object.assign(downloadButton.style, {
            flex: "1",
            padding: "10px",
            border: "none",
            borderRadius: "8px",
            backgroundColor: "#3a7bd5",
            color: "white",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500",
            transition: "all 0.2s ease",
        });

        downloadButton.onmouseover = () => {
            downloadButton.style.backgroundColor = "#2d62aa";
        };

        downloadButton.onmouseout = () => {
            downloadButton.style.backgroundColor = "#3a7bd5";
        };

        rangeButtons.appendChild(downloadButton);

        rangeContent.appendChild(rangeButtons);

        // Add contact/issue links
        const contactContainer = document.createElement("div");
        Object.assign(contactContainer.style, {
            marginTop: "16px",
            textAlign: "center",
            fontSize: "13px",
        });

        const contactLink = document.createElement("a");
        contactLink.href = "mailto:yeorinhieut@gmail.com";
        contactLink.textContent = "Contact Developer";
        Object.assign(contactLink.style, {
            color: "#666",
            textDecoration: "none",
            borderBottom: "1px dotted #999",
        });

        contactLink.onmouseover = () => {
            contactLink.style.color = "#3a7bd5";
            contactLink.style.borderBottom = "1px dotted #3a7bd5";
        };

        contactLink.onmouseout = () => {
            contactLink.style.color = "#666";
            contactLink.style.borderBottom = "1px dotted #999";
        };

        contactContainer.appendChild(contactLink);

        const separator = document.createElement("span");
        separator.textContent = " · ";
        separator.style.color = "#999";
        contactContainer.appendChild(separator);

        const issueLink = document.createElement("a");
        issueLink.href = "https://github.com/yeorinhieut/novel-dl/issues";
        issueLink.textContent = "Report an Issue";
        issueLink.target = "_blank";
        Object.assign(issueLink.style, {
            color: "#666",
            fontSize: "13px",
            textDecoration: "none",
            borderBottom: "1px dotted #999",
        });

        issueLink.onmouseover = () => {
            issueLink.style.color = "#3a7bd5";
            issueLink.style.borderBottom = "1px dotted #3a7bd5";
        };

        issueLink.onmouseout = () => {
            issueLink.style.color = "#666";
            issueLink.style.borderBottom = "1px dotted #999";
        };

        contactContainer.appendChild(issueLink);
        rangeContent.appendChild(contactContainer);

        rangeDialog.appendChild(rangeContent);
        document.body.appendChild(rangeDialog);

        // Download button click handler
        downloadButton.onclick = () => {
            const startEpisode = Number.parseInt(startInput.input.value, 10);
            const endEpisode = Number.parseInt(endInput.input.value, 10);
            console.log("[runCrawler] Download range input:", {
                startEpisode,
                endEpisode,
            });

            if (
                Number.isNaN(startEpisode) ||
                Number.isNaN(endEpisode) ||
                startEpisode < 1 ||
                endEpisode < startEpisode ||
                endEpisode > allEpisodeLinks.length
            ) {
                showNotification("Invalid Range", "Please enter a valid chapter range.");
                console.log("[runCrawler] Invalid chapter range input, exiting.");
                return;
            }

            const delay = Number.parseInt(delayInput.input.value, 10);
            console.log("[runCrawler] Delay input:", delay);
            if (Number.isNaN(delay) || delay < 1000) {
                showNotification("Invalid Delay", "Please enter a valid delay value (minimum 1000ms).");
                console.log("[runCrawler] Invalid delay input, exiting.");
                return;
            }

            document.body.removeChild(rangeDialog);

            console.log(
                `Task added: Preparing to download "${title}" (Chapters ${startEpisode} to ${endEpisode})`,
            );

            // Call downloadNovel, which will then show the save options and call processDownloadCore
            downloadNovel(title, allEpisodeLinks, startEpisode, endEpisode, delay);
        };

        // Accessibility for range dialog
        setModalAccessibility(
            rangeDialog,
            startInput.input,
            () => document.body.removeChild(rangeDialog),
            downloadButton,
        );
    };

    // Accessibility for initial dialog
    setModalAccessibility(dialog, pagesInput.input, () => document.body.removeChild(dialog), continueButton);
}


// Part 6: Retry Mechanism

/**
 * Displays a dialog to upload a report file and initiate retry download.
 * @param {string} novelTitle - The title of the novel for which to retry.
 */
async function showRetryFromFileDialog(novelTitle) {
    const dialog = document.createElement("div");
    Object.assign(dialog.style, {
        position: "fixed",
        zIndex: "9999",
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    });

    const dialogContent = document.createElement("div");
    Object.assign(dialogContent.style, {
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        width: "400px",
        maxWidth: "90%",
        padding: "24px",
        textAlign: "center",
    });

    const dialogTitle = document.createElement("h3");
    dialogTitle.textContent = `Upload File to Retry`;
    Object.assign(dialogTitle.style, {
        margin: "0 0 20px 0",
        color: "#172238",
        fontSize: "18px",
        fontWeight: "600",
    });
    dialogContent.appendChild(dialogTitle);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".txt"; // Only accept text files
    Object.assign(fileInput.style, {
        display: "block",
        margin: "20px auto",
        padding: "10px",
        border: "1px solid #e4e9f0",
        borderRadius: "8px",
        width: "calc(100% - 20px)",
        boxSizing: "border-box",
    });
    dialogContent.appendChild(fileInput);

    const uploadButton = document.createElement("button");
    uploadButton.textContent = "Upload File and Retry";
    Object.assign(uploadButton.style, {
        width: "100%",
        padding: "12px",
        border: "none",
        borderRadius: "8px",
        backgroundColor: "#3a7bd5",
        color: "white",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        transition: "all 0.2s ease",
    });
    uploadButton.onmouseover = () => { uploadButton.style.backgroundColor = "#2d62aa"; };
    uploadButton.onmouseout = () => { uploadButton.style.backgroundColor = "#3a7bd5"; };
    dialogContent.appendChild(uploadButton);

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    Object.assign(cancelButton.style, {
        width: "100%",
        padding: "10px",
        border: "1px solid #e4e9f0",
        borderRadius: "8px",
        backgroundColor: "#f9f9fb",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        marginTop: "10px",
        transition: "all 0.2s ease",
    });
    cancelButton.onmouseover = () => { cancelButton.style.backgroundColor = "#f0f2f8"; };
    cancelButton.onmouseout = () => { cancelButton.style.backgroundColor = "#f9f9fb"; };
    cancelButton.onclick = () => document.body.removeChild(dialog);
    dialogContent.appendChild(cancelButton);

    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    uploadButton.onclick = () => {
        const file = fileInput.files[0];
        if (!file) {
            showNotification("File Selection Required", "Please select a file to retry.");
            return;
        }

        document.body.removeChild(dialog); // Close upload dialog

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            const urlsToRetry = parseReportFile(content);

            if (urlsToRetry.length === 0) {
                showNotification("No URLs Found", "No URLs to retry were found in the file.");
                return;
            }

            // For retries, we assume ZIP download for consistency and to include new report
            // Pass the original file name for better report naming
            // We need to extract the novel title again for the retry
            const title = extractTitle();
            if (!title) {
                showNotification("Title Extraction Failed", "Could not extract novel title. Cannot use retry feature.");
                return;
            }
            await processDownloadCore(title, urlsToRetry, 5000, true, file.name);
        };
        reader.onerror = (e) => {
            console.error("File read error:", e);
            showNotification("File Read Error", "An error occurred while reading the file.");
        };
        reader.readAsText(file);
    };
}

/**
 * Parses the content of a report file to extract URLs.
 * Assumes URLs are on lines containing "URL: ".
 * @param {string} fileContent - The text content of the report file.
 * @returns {Array<string>} An array of extracted URLs.
 */
function parseReportFile(fileContent) {
    const urls = [];
    const lines = fileContent.split('\n');
    for (const line of lines) {
        const match = line.match(/URL: (https?:\/\/[^\s]+)/);
        if (match && match[1]) {
            urls.push(match[1]);
        }
    }
    return urls;
}



// Part 7: Accessibility and FAB Initialization

/**
 * Sets accessibility features for a modal dialog.
 * Handles focus trapping within the modal and closing with ESC key.
 * @param {HTMLElement} modal - The modal element.
 * @param {HTMLElement} firstInput - The first input element to focus on.
 * @param {function} closeCallback - Function to call when the modal should be closed.
 * @param {HTMLElement} defaultButton - The button to click on Enter key press.
 */
function setModalAccessibility(
    modal,
    firstInput,
    closeCallback,
    defaultButton,
) {
    if (firstInput) firstInput.focus();
    modal.tabIndex = -1; // Make modal focusable
    modal.focus(); // Focus the modal to capture key events
    modal.addEventListener("keydown", (e) => {
        const focusable = modal.querySelectorAll(
            'input, button, [tabindex]:not([tabindex="-1"])',
        );
        const focusArr = Array.from(focusable);
        const idx = focusArr.indexOf(document.activeElement);
        if (e.key === "Tab") {
            if (e.shiftKey) {
                // If Shift+Tab and on first element, loop to last
                if (idx === 0) {
                    focusArr[focusArr.length - 1].focus();
                    e.preventDefault();
                }
            } else {
                // If Tab and on last element, loop to first
                if (idx === focusArr.length - 1) {
                    focusArr[0].focus();
                    e.preventDefault();
                }
            }
        }
        if (e.key === "Escape") {
            closeCallback(); // Close modal on ESC
        }
        if (e.key === "Enter" && defaultButton) {
            // Trigger default button click on Enter if focus is on an input or the default button itself
            if (
                document.activeElement.tagName === "INPUT" ||
                document.activeElement === defaultButton
            ) {
                defaultButton.click();
            }
        }
    });
}

/**
 * Initializes the floating action button and its menu.
 */
function initializeFabMenu() {
    // Ensure styles are added
    if (!document.getElementById("novel-dl-styles")) {
        const style = document.createElement("style");
        style.id = "novel-dl-styles";
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes pulse {
                0% { opacity: 0.7; }
                50% { opacity: 1; }
                100% { opacity: 0.7; }
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .fab-button {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 60px;
                height: 60px;
                background-color: #3a7bd5;
                color: white;
                border: none;
                border-radius: 50%;
                font-size: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                transition: background-color 0.3s, transform 0.3s;
                z-index: 9990; /* Below modals, above page content */
            }
            .fab-button:hover {
                background-color: #2d62aa;
                transform: translateY(-2px);
            }
            .fab-button:active {
                transform: translateY(0);
                box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            }

            .fab-menu-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.6);
                z-index: 9995; /* Above FAB, below modals */
                display: flex;
                align-items: flex-end;
                justify-content: flex-end;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s, visibility 0.3s;
            }
            .fab-menu-overlay.active {
                opacity: 1;
                visibility: visible;
            }

            .fab-menu {
                background-color: #fff;
                border-radius: 12px;
                box-shadow: 0 6px 30px rgba(0,0,0,0.2);
                margin: 80px 20px 20px 20px; /* Adjust margin to avoid FAB */
                padding: 16px;
                width: 250px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                transform: translateY(20px);
                opacity: 0;
                transition: transform 0.3s, opacity 0.3s;
            }
            .fab-menu-overlay.active .fab-menu {
                transform: translateY(0);
                opacity: 1;
            }

            .fab-menu-item {
                padding: 12px 16px;
                font-size: 15px;
                color: #172238;
                cursor: pointer;
                border-radius: 8px;
                transition: background-color 0.2s, color 0.2s;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .fab-menu-item:hover {
                background-color: #f0f2f8;
                color: #3a7bd5;
            }
            .fab-menu-item svg {
                width: 20px;
                height: 20px;
                fill: currentColor; /* Use current text color for SVG */
            }
        `;
        document.head.appendChild(style);
    }

    const fabButton = document.createElement('button');
    fabButton.className = 'fab-button';
    fabButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
        </svg>
    `; // Plus icon
    document.body.appendChild(fabButton);

    const menuOverlay = document.createElement('div');
    menuOverlay.className = 'fab-menu-overlay';
    document.body.appendChild(menuOverlay);

    const menu = document.createElement('div');
    menu.className = 'fab-menu';
    menuOverlay.appendChild(menu);

    // Menu Item: Start New Download
    const newDownloadItem = document.createElement('div');
    newDownloadItem.className = 'fab-menu-item';
    newDownloadItem.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
        </svg>
        Start New Download
    `; // Download icon
    newDownloadItem.onclick = () => {
        menuOverlay.classList.remove('active');
        runCrawler();
    };
    menu.appendChild(newDownloadItem);

    // Menu Item: Retry from File
    const retryFromFileItem = document.createElement('div');
    retryFromFileItem.className = 'fab-menu-item';
    retryFromFileItem.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-2 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-2-7V4l4 4h-4z"/>
        </svg>
        Retry from File
    `; // File icon
    retryFromFileItem.onclick = () => {
        menuOverlay.classList.remove('active');
        const currentTitle = extractTitle(); // Get title for retry dialog
        if (currentTitle) {
            showRetryFromFileDialog(currentTitle);
        } else {
            showNotification("Error", "Could not extract novel title. Cannot use retry feature.");
        }
    };
    menu.appendChild(retryFromFileItem);

    // Toggle menu visibility
    fabButton.addEventListener('click', () => {
        menuOverlay.classList.toggle('active');
    });

    // Close menu when clicking outside
    menuOverlay.addEventListener('click', (e) => {
        if (e.target === menuOverlay) {
            menuOverlay.classList.remove('active');
        }
    });

    // Close menu on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menuOverlay.classList.contains('active')) {
            menuOverlay.classList.remove('active');
        }
    });
}

// Initialize the FAB and menu when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeFabMenu);
