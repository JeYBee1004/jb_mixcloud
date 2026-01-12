document.addEventListener('contextmenu', function (e) {
e.preventDefault();
});

document.addEventListener('keydown', function (e) {
if (
    e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) ||
    (e.ctrlKey && e.key === 'U')
) {
    e.preventDefault();
}
});

const SUPABASE_URL = 'https://ocjppztixpvqcmqozmto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9janBwenRpeHB2cWNtcW96bXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjI3ODEsImV4cCI6MjA3NDA5ODc4MX0.I8UEF_Sq-50wfikKmOc7StoqdHj0vclQbzCsfkCSb4c';

try {
    if (
        SUPABASE_URL && SUPABASE_ANON_KEY &&
        SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE' &&
        SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY_HERE'
    ) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client initialized successfully');
    } else {
        console.error('❌ Supabase credentials not configured properly');
    }
} catch (error) {
    console.error('❌ Error initializing Supabase:', error);
}


async function fetchMixesFromSupabase() {
    if (!supabase) {
        console.error('❌ Supabase client not initialized.');
        return [];
    }

    try {
        console.log('🔄 Fetching mixes from Supabase...');
        const { data: mixes, error } = await supabase
            .from('mixes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!mixes || mixes.length === 0) {
            console.warn('⚠️ No mixes found in database');
            return [];
        }

        console.log(`✅ ${mixes.length} mixes fetched.`);

        
        const transformedMixes = mixes.map((mix) => {
            const storagePath = mix.audio_file_path?.trim();
            if (!storagePath) {
                console.warn(`⚠️ No audio file path found for mix: ${mix.title}`);
                return null;
            }

            
            const { data: publicUrlData, error: publicUrlError } = supabase
                .storage
                .from('mixcl0ud')
                .getPublicUrl(storagePath);

            if (publicUrlError) {
                console.error(`❌ Error generating public URL for ${mix.title}:`, publicUrlError.message);
                return null;
            }

            const audioUrl = publicUrlData?.publicUrl;
            if (!audioUrl) {
                console.warn(`⚠️ Missing public URL for: ${mix.title}`);
                return null;
            }

            console.log(`🎧 Public URL for "${mix.title}":`, audioUrl);

            return {
                id: mix.id.toString(),
                title: mix.title || '',
                artist: mix.artist || '',
                genre: mix.genre || '',
                duration: mix.duration || '0:00',
                audioUrl,
                createdAt: mix.created_at
            };
        }).filter(Boolean);

        console.log(`✅ Ready to render ${transformedMixes.length} mixes`);
        return transformedMixes;
    } catch (error) {
        console.error('❌ Error fetching mixes:', error);
        return [];
    }
}


class AudioPlayer {
    constructor(audioElement, mixCard) {
        this.audio = audioElement;
        this.mixCard = mixCard;
        this.isPlaying = false;
        this.isLoading = false;
        this.hasError = false;

        this.playBtn = mixCard.querySelector(".play-btn");
        this.downloadBtn = mixCard.querySelector(".download-btn");
        this.shareBtn = mixCard.querySelector(".share-btn");
        this.likeBtn = mixCard.querySelector(".like-btn");
        this.progressBar = mixCard.querySelector(".progress-bar");
        this.progressFill = mixCard.querySelector(".progress-fill");
        this.currentTimeEl = mixCard.querySelector(".current-time");
        this.totalTimeEl = mixCard.querySelector(".total-time");
        this.errorMessage = mixCard.querySelector(".error-message");

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.audio.addEventListener("loadstart", () => this.handleLoadStart());
        this.audio.addEventListener("canplay", () => this.handleCanPlay());
        this.audio.addEventListener("loadedmetadata", () => this.handleLoadedMetadata());
        this.audio.addEventListener("timeupdate", () => this.handleTimeUpdate());
        this.audio.addEventListener("ended", () => this.handleEnded());
        this.audio.addEventListener("error", (e) => this.handleError(e));

        this.playBtn.addEventListener("click", () => this.togglePlayPause());
        this.downloadBtn.addEventListener("click", () => this.handleDownload());
        this.shareBtn.addEventListener("click", () => this.handleShare());
        this.likeBtn.addEventListener("click", () => this.toggleLike());
        this.progressBar.addEventListener("click", (e) => this.handleProgressClick(e));
    }

    handleLoadStart() {
        this.isLoading = true;
        this.hasError = false;
        this.updatePlayButton();
        this.errorMessage.style.display = "none";
        console.log('🎵 Loading:', this.audio.src);
    }

    handleCanPlay() {
        this.isLoading = false;
        this.hasError = false;
        this.updatePlayButton();
        console.log('✅ Audio ready');
    }

    handleLoadedMetadata() {
        this.totalTimeEl.textContent = this.formatTime(this.audio.duration);
    }

    handleTimeUpdate() {
        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressFill.style.width = `${progress}%`;
        this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    }

    handleEnded() {
        this.isPlaying = false;
        this.updatePlayButton();
        if (window.currentlyPlaying === this) window.currentlyPlaying = null;
    }

    handleError(event) {
        this.hasError = true;
        this.isPlaying = false;
        this.isLoading = false;
        this.updatePlayButton();
        this.errorMessage.style.display = "block";

        const error = this.audio.error;
        let msg = 'Unknown error';
        if (error) {
            switch (error.code) {
                case error.MEDIA_ERR_NETWORK: msg = 'Network issue'; break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Source not supported'; break;
                case error.MEDIA_ERR_DECODE: msg = 'Corrupted or unsupported audio'; break;
            }
        }
        console.error('❌ Audio playback error:', { src: this.audio.src, message: msg });
    }

    handleProgressClick(e) {
        if (this.hasError || !this.audio.duration) return;
        const rect = this.progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        this.audio.currentTime = (clickX / rect.width) * this.audio.duration;
    }

    async togglePlayPause() {
        if (this.hasError || this.isLoading) return;
        try {
            if (this.isPlaying) {
                this.audio.pause();
                this.isPlaying = false;
                if (window.currentlyPlaying === this) window.currentlyPlaying = null;
            } else {
                if (window.currentlyPlaying && window.currentlyPlaying !== this) {
                    window.currentlyPlaying.audio.pause();
                    window.currentlyPlaying.isPlaying = false;
                    window.currentlyPlaying.updatePlayButton();
                }
                this.isLoading = true;
                this.updatePlayButton();
                await this.audio.play();
                this.isPlaying = true;
                this.isLoading = false;
                window.currentlyPlaying = this;
            }
            this.updatePlayButton();
        } catch (err) {
            console.error("❌ Playback error:", err);
            this.handleError();
        }
    }

    updatePlayButton() {
        const icon = this.playBtn.querySelector("i");
        if (this.isLoading) icon.className = "fas fa-spinner fa-spin";
        else if (this.hasError) icon.className = "fas fa-exclamation-circle";
        else if (this.isPlaying) icon.className = "fas fa-pause";
        else icon.className = "fas fa-play";
    }

    async handleDownload() {
        if (!this.audio.src || this.hasError) {
            alert("Audio unavailable for download");
            return;
        }

        try {
            // Show loading state
            const originalIcon = this.downloadBtn.querySelector("i").className;
            this.downloadBtn.querySelector("i").className = "fas fa-spinner fa-spin";
            this.downloadBtn.disabled = true;

            // Fetch the audio file as a blob
            const response = await fetch(this.audio.src);
            if (!response.ok) throw new Error('Download failed');
            
            const blob = await response.blob();
            
            // Create a temporary URL for the blob
            const blobUrl = window.URL.createObjectURL(blob);
            
            // Create and trigger download link
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = `${this.mixCard.dataset.artist} - ${this.mixCard.dataset.title}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the blob URL after a short delay
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
            
            console.log(`✅ Download started: ${link.download}`);
            
            // Restore button state
            this.downloadBtn.querySelector("i").className = originalIcon;
            this.downloadBtn.disabled = false;
        } catch (error) {
            console.error("❌ Download error:", error);
            alert("Failed to download the mix. Please try again.");
            
            // Restore button state
            this.downloadBtn.querySelector("i").className = "fas fa-download";
            this.downloadBtn.disabled = false;
        }
    }

    async handleShare() {
        // Create a shareable URL with mix ID as hash parameter
        const mixId = this.mixCard.dataset.mixId;
        const baseUrl = window.location.origin + window.location.pathname;
        const mixUrl = `${baseUrl}#mix-${mixId}`;
        
        const shareData = {
            title: `${this.mixCard.dataset.artist} - ${this.mixCard.dataset.title}`,
            text: `Check out this ${this.mixCard.dataset.genre} mix by ${this.mixCard.dataset.artist}!`,
            url: mixUrl,
        };

        // Try native Web Share API first (works on mobile)
        if (navigator.share) {
            try {
                await navigator.share(shareData);
                console.log('✅ Shared successfully via Web Share API');
            } catch (err) {
                // User cancelled or error occurred
                if (err.name !== 'AbortError') {
                    console.log('⚠️ Web Share failed, using fallback');
                    this.fallbackShare(shareData);
                }
            }
        } else {
            // Fallback for desktop browsers
            this.fallbackShare(shareData);
        }
    }

    fallbackShare(shareData) {
        const url = encodeURIComponent(shareData.url);
        const text = encodeURIComponent(shareData.text);
        
        // Try to copy to clipboard first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareData.url).then(() => {
                // Show options after copying
                const choice = confirm(
                    `Link copied to clipboard!\n\n${shareData.url}\n\nWould you like to share on social media?`
                );
                
                if (choice) {
                    this.showSocialShareOptions(url, text);
                }
            }).catch(() => {
                // Clipboard failed, show options directly
                this.showSocialShareOptions(url, text);
            });
        } else {
            // No clipboard API, show options directly
            this.showSocialShareOptions(url, text);
        }
    }

    showSocialShareOptions(url, text) {
        const shareLinks = {
            1: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
            2: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
            3: `https://wa.me/?text=${text}%20${url}`,
            4: `https://t.me/share/url?url=${url}&text=${text}`,
        };
        
        const choice = prompt(
            "Share this mix via:\n\n" +
            "1. Twitter/X\n" +
            "2. Facebook\n" +
            "3. WhatsApp\n" +
            "4. Telegram\n\n" +
            "Enter number (1-4):"
        );
        
        if (choice >= 1 && choice <= 4) {
            window.open(shareLinks[choice], "_blank", "width=600,height=400");
            console.log(`✅ Opened share dialog for option ${choice}`);
        }
    }

    toggleLike() {
        this.likeBtn.classList.toggle("liked");
        const icon = this.likeBtn.querySelector("i");
        if (this.likeBtn.classList.contains("liked")) {
            icon.className = "fas fa-heart";
        } else {
            icon.className = "far fa-heart";
        }
    }

    formatTime(sec) {
        if (isNaN(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    }
}

// ============================================
// CREATE MIX CARD
// ============================================
function createMixCard(mix) {
    const template = document.getElementById("mix-card-template");
    const card = template.content.cloneNode(true);
    const mixCard = card.querySelector(".mix-card");

    mixCard.dataset.mixId = mix.id;
    mixCard.dataset.title = mix.title;
    mixCard.dataset.artist = mix.artist;
    mixCard.dataset.genre = mix.genre;

    card.querySelector(".mix-title").textContent = mix.title;
    card.querySelector(".mix-artist").textContent = mix.artist;
    card.querySelector(".mix-genre").textContent = mix.genre;
    card.querySelector(".total-time").textContent = mix.duration;

    const audio = card.querySelector("audio");
    audio.src = mix.audioUrl;

    return { card, mixCard, audio };
}

// ============================================
// RENDER MIXES
// ============================================
async function renderMixes() {
    const container = document.getElementById("mixes-container");
    const noMixes = document.getElementById("no-mixes");

    container.innerHTML = `
        <div style="text-align:center;padding:40px;color:#ccc;">
            <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
            <p>Loading mixes...</p>
        </div>`;
    noMixes.style.display = "none";

    const mixes = await fetchMixesFromSupabase();
    container.innerHTML = "";

    if (mixes.length === 0) {
        noMixes.style.display = "block";
        return;
    }

    mixes.forEach((mix) => {
        const { card, mixCard, audio } = createMixCard(mix);
        container.appendChild(card);
        new AudioPlayer(audio, mixCard);
    });

    scrollToMixFromHash();
}

function scrollToMixFromHash() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#mix-')) {
        const mixId = hash.replace('#mix-', '');
        const mixCard = document.querySelector(`[data-mix-id="${mixId}"]`);
        if (mixCard) {
            setTimeout(() => {
                mixCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                mixCard.style.boxShadow = '0 0 40px rgba(255, 0, 0, 0.9)';
                setTimeout(() => {
                    mixCard.style.boxShadow = '';
                }, 2000);
            }, 500);
        }
    }
}

// ============================================
// NAVIGATION
// ============================================
function setupNavigation() {
    const hamburger = document.querySelector('.hamburger');
    const nav = document.querySelector('nav');
    hamburger.addEventListener('click', () => nav.classList.toggle('active'));
    document.addEventListener('click', (e) => {
        if (!nav.contains(e.target) && !hamburger.contains(e.target)) nav.classList.remove('active');
    });
}

// ============================================
// INIT
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log('🚀 XOXX Mixes loading...');
    setupNavigation();
    await renderMixes();
});
window.currentlyPlaying = null;
