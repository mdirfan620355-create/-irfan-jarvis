// State Management
let recognition = null;
let isListening = false;
let autoSpeak = true;
let conversationHistory = [];
let availableVoices = [];

// DOM References
const reactorCore = document.getElementById('reactor-core');
const statusIndicator = document.getElementById('status-indicator');
const hudSubtext = document.getElementById('hud-subtext');
const chatContainer = document.getElementById('chat-container');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const micMainBtn = document.getElementById('mic-main-btn');
const btnStartListen = document.getElementById('btn-start-listen');
const btnStopListen = document.getElementById('btn-stop-listen');
const btnHeyJarvis = document.getElementById('btn-hey-jarvis');
const btnClearChat = document.getElementById('btn-clear-chat');
const settingsToggle = document.getElementById('settings-toggle');
const closeSettings = document.getElementById('close-settings');
const settingsModal = document.getElementById('settings-modal');
const langSelect = document.getElementById('lang-select');
const voiceSelect = document.getElementById('voice-select');
const toggleSpeech = document.getElementById('toggle-speech');
const chips = document.querySelectorAll('.chip');

// 1. Text to Speech (TTS)
function initSpeechSynthesis() {
  if (!('speechSynthesis' in window)) return;

  function loadVoices() {
    availableVoices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '<option value="">Default System Voice</option>';

    availableVoices.forEach((voice, index) => {
      if (voice.lang.includes('hi') || voice.lang.includes('en')) {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
      }
    });
  }

  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// 2. Speech-to-Text (STT)
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    updateStatus('MIC UNSUPPORTED', true);
    hudSubtext.innerText = 'Speech recognition requires Chrome or Edge.';
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = langSelect.value;

  recognition.onstart = () => {
    isListening = true;
    reactorCore.classList.add('listening');
    updateStatus('LISTENING...');
    hudSubtext.innerText = 'Listening to your voice, Sir...';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    hudSubtext.innerText = `Recognized: "${transcript}"`;
    handleUserMessage(transcript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isListening = false;
    reactorCore.classList.remove('listening');
    if (event.error === 'not-allowed') {
      updateStatus('MIC BLOCKED', true);
      alert('Microphone permission was blocked. Please tap the lock icon in Chrome address bar and allow Microphone.');
    } else {
      updateStatus('VOICE ERROR', true);
    }
  };

  recognition.onend = () => {
    isListening = false;
    reactorCore.classList.remove('listening');
    updateStatus('SYSTEM: READY');
  };

  return true;
}

function startListening() {
  if (!recognition && !initSpeechRecognition()) return;

  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    reactorCore.classList.remove('speaking');
  }

  try {
    recognition.lang = langSelect.value;
    recognition.start();
  } catch (err) {
    console.warn('Recognition start state:', err);
  }
}

function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

// 3. Audio Voice Output
function speakText(text) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  // Strip excessive markdown formatting before speaking
  const cleanSpeech = text
    .replace(/[*#_`]/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanSpeech);
  utterance.lang = langSelect.value;

  if (voiceSelect.value !== '') {
    utterance.voice = availableVoices[parseInt(voiceSelect.value, 10)];
  }

  utterance.onstart = () => {
    reactorCore.classList.add('speaking');
    updateStatus('JARVIS SPEAKING');
  };

  utterance.onend = () => {
    reactorCore.classList.remove('speaking');
    updateStatus('SYSTEM: ONLINE');
  };

  utterance.onerror = () => {
    reactorCore.classList.remove('speaking');
    updateStatus('AUDIO ERROR', true);
  };

  window.speechSynthesis.speak(utterance);
}

// 4. Send Message to Backend AI
async function handleUserMessage(message) {
  if (!message || message.trim() === '') return;

  appendChatBubble('USER', message, 'user-bubble');
  textInput.value = '';
  updateStatus('PROCESSING QUERY...');
  hudSubtext.innerText = 'JARVIS is analyzing...';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        history: conversationHistory
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Server connection error');
    }

    const aiReply = data.reply;

    // Remember in-session conversation
    conversationHistory.push({ role: 'user', text: message });
    conversationHistory.push({ role: 'assistant', text: aiReply });

    appendChatBubble('JARVIS', aiReply, 'jarvis-bubble', true);
    hudSubtext.innerText = 'Tap mic or click "Hey Jarvis"';
    updateStatus('SYSTEM: ONLINE');

    if (autoSpeak) {
      speakText(aiReply);
    }
  } catch (error) {
    console.error('AI Error:', error);
    updateStatus('SYSTEM: ERROR', true);
    appendChatBubble('JARVIS', `Alert Irfan: ${error.message}`, 'jarvis-bubble');
    hudSubtext.innerText = 'Error occurred. Verify internet connection.';
  }
}

// 5. UI Helpers
function appendChatBubble(sender, text, className, addSpeakBtn = false) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${className}`;

  const tag = document.createElement('div');
  tag.className = 'bubble-tag';
  tag.innerText = sender;
  bubble.appendChild(tag);

  const p = document.createElement('p');
  p.innerText = text;
  bubble.appendChild(p);

  if (addSpeakBtn) {
    const speakBtn = document.createElement('button');
    speakBtn.className = 'speak-msg-btn';
    speakBtn.innerText = '🔊 Speak';
    speakBtn.onclick = () => speakText(text);
    bubble.appendChild(speakBtn);
  }

  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateStatus(text, isError = false) {
  statusIndicator.innerText = text;
  statusIndicator.style.color = isError ? 'var(--danger)' : 'var(--text-main)';
}

// 6. Event Listeners
micMainBtn.addEventListener('click', () => {
  if (isListening) stopListening();
  else startListening();
});

btnStartListen.addEventListener('click', startListening);
btnStopListen.addEventListener('click', stopListening);

btnHeyJarvis.addEventListener('click', () => {
  speakText("Yes Irfan, I am listening. How can I help you?");
  setTimeout(startListening, 2200);
});

btnClearChat.addEventListener('click', () => {
  conversationHistory = [];
  chatContainer.innerHTML = '';
  appendChatBubble('JARVIS', 'Memory cleared, Sir. Ready for new commands.', 'jarvis-bubble', true);
});

sendBtn.addEventListener('click', () => handleUserMessage(textInput.value));
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleUserMessage(textInput.value);
});

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    handleUserMessage(chip.getAttribute('data-prompt'));
  });
});

settingsToggle.addEventListener('click', () => settingsModal.style.display = 'flex');
closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
toggleSpeech.addEventListener('change', (e) => autoSpeak = e.target.checked);

window.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.style.display = 'none';
});

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  initSpeechSynthesis();
  initSpeechRecognition();
});