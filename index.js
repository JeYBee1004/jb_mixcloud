(function antiInspect(window, document) {
  'use strict';

  let warned = false;

  function showWarning() {
    if (warned) return;
    warned = true;

    const banner = document.createElement('div');
    banner.textContent = '⚠️ Developer tools are restricted on this site.';
    banner.style = `
      position:fixed;
      bottom:20px;
      left:50%;
      transform:translateX(-50%);
      background:#222;
      color:#fff;
      padding:10px 16px;
      border-radius:6px;
      font-family:Arial;
      z-index:99999;
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
  }

  document.addEventListener('contextmenu', e => {
    e.preventDefault();
    showWarning();
  }, { passive:false });

  document.addEventListener('keydown', e => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I','J','C','K','S'].includes(e.key.toUpperCase())) ||
      (e.ctrlKey && e.key.toUpperCase() === 'U')
    ) {
      e.preventDefault();
      e.stopPropagation();
      showWarning();
    }
  }, { passive:false });

}(window, document));


// ============================================
// SUPABASE INIT
// ============================================
let supabase = null;

const SUPABASE_URL = 'https://ocjppztixpvqcmqozmto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9janBwenRpeHB2cWNtcW96bXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjI3ODEsImV4cCI6MjA3NDA5ODc4MX0.I8UEF_Sq-50wfikKmOc7StoqdHj0vclQbzCsfkCSb4c';

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Supabase client initialized');
} else {
  console.warn('⚠️ Supabase credentials missing');
}


// ============================================
// SIGNED AUDIO URL HELPER
// ============================================
async function getSignedAudioUrl(path) {
  try {
    const { data, error } = await supabase
      .storage
      .from('mixcl0ud')
      .createSignedUrl(path, 3600);

    if (error) throw error;
    return data.signedUrl;
  } catch (err) {
    console.error('❌ Signed URL error:', err.message);
    return null;
  }
}


// ============================================
// FETCH MIXES FROM SUPABASE
// ============================================
async function fetchMixesFromSupabase() {
  if (!supabase) return [];

  try {
    const { data: mixes, error } = await supabase
      .from('mixes')
      .select('*')
      .order('created_at', { ascending:false });

    if (error || !mixes) throw error;

    const transformedMixes = [];

    for (const mix of mixes) {
      if (!mix.audio_file_path) continue;

      const audioUrl = await getSignedAudioUrl(mix.audio_file_path.trim());
      if (!audioUrl) continue;

      transformedMixes.push({
        id: mix.id.toString(),
        title: mix.title || '',
        artist: mix.artist || '',
        genre: mix.genre || '',
        duration: mix.duration || '0:00',
        audioUrl,
        createdAt: mix.created_at
      });
    }

    return transformedMixes;
  } catch (error) {
    console.error('❌ Error fetching mixes:', error);
    return [];
  }
}


// ============================================
// AUDIO PLAYER CLASS (MOBILE SAFE)
// ============================================
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
    this.statusEl = mixCard.querySelector(".audio-status");

    this.audio.preload = "metadata";
    this.audio.playsInline = true;
    this.audio.crossOrigin = "anonymous";

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.audio.addEventListener("loadstart", () => {
      this.isLoading = true;
      this.statusEl.textContent = "⏳ Loading audio…";
      this.updatePlayButton();
    });

    this.audio.addEventListener("canplay", () => {
      this.isLoading = false;
      this.statusEl.textContent = "▶ Ready";
      this.totalTimeEl.textContent = this.formatTime(this.audio.duration);
      this.updatePlayButton();
    });

    this.audio.addEventListener("timeupdate", () => {
      const progress = (this.audio.currentTime / this.audio.duration) * 100;
      this.progressFill.style.width = `${progress}%`;
      this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    });

    this.audio.addEventListener("error", () => {
      this.hasError = true;
      this.statusEl.textContent = "❌ Audio failed to load";
      this.updatePlayButton();
    });

    this.playBtn.addEventListener("click", () => this.togglePlayPause());
    this.progressBar.addEventListener("click", e => this.handleProgressClick(e));
  }

  async togglePlayPause() {
    if (this.hasError || this.isLoading) return;

    try {
      if (this.isPlaying) {
        this.audio.pause();
        this.isPlaying = false;
      } else {
        if (window.currentlyPlaying && window.currentlyPlaying !== this) {
          window.currentlyPlaying.audio.pause();
          window.currentlyPlaying.isPlaying = false;
          window.currentlyPlaying.updatePlayButton();
        }
        await this.audio.play();
        this.isPlaying = true;
        window.currentlyPlaying = this;
      }
      this.updatePlayButton();
    } catch (err) {
      this.statusEl.textContent = "❌ Playback blocked";
      console.error(err);
    }
  }

  updatePlayButton() {
    const icon = this.playBtn.querySelector("i");
    if (this.isLoading) icon.className = "fas fa-spinner fa-spin";
    else if (this.hasError) icon.className = "fas fa-exclamation-circle";
    else if (this.isPlaying) icon.className = "fas fa-pause";
    else icon.className = "fas fa-play";
  }

  handleProgressClick(e) {
    if (!this.audio.duration) return;
    const rect = this.progressBar.getBoundingClientRect();
    this.audio.currentTime = ((e.clientX - rect.left) / rect.width) * this.audio.duration;
  }

  formatTime(sec) {
    if (isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
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
  card.querySelector(".audio-status").textContent = "Preparing audio…";

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

  if (!mixes.length) {
    noMixes.style.display = "block";
    return;
  }

  mixes.forEach(mix => {
    const { card, mixCard, audio } = createMixCard(mix);
    container.appendChild(card);
    new AudioPlayer(audio, mixCard);
  });
}


// ============================================
// NAVIGATION
// ============================================
function setupNavigation() {
  const hamburger = document.querySelector('.hamburger');
  const nav = document.querySelector('nav');

  hamburger.addEventListener('click', () => nav.classList.toggle('active'));
  document.addEventListener('click', e => {
    if (!nav.contains(e.target) && !hamburger.contains(e.target))
      nav.classList.remove('active');
  });
}


// ============================================
// INIT
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  window.currentlyPlaying = null;
  setupNavigation();
  await renderMixes();
});
