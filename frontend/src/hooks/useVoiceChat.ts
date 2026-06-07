import { ref } from 'vue';
import { store } from '../stores';
import { ElMessage } from 'element-plus';

const localeVoiceMap: Record<string, string> = {
  'en': 'en-US', 'vi': 'vi-VN', 'vn': 'vi-VN',
  'ja': 'ja-JP', 'zh': 'zh-CN', 'ko': 'ko-KR',
  'fr': 'fr-FR', 'de': 'de-DE'
};

export function useVoiceChat(onTranscribed: (text: string) => void) {
  const listening = ref(false);

  const toggleVoiceListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      ElMessage.warning(store.t('Voice recognition is not supported in this browser.'));
      return;
    }
    if (listening.value) {
      listening.value = false;
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = localeVoiceMap['en'];
    recognition.interimResults = false;
    recognition.onstart = () => {
      listening.value = true;
      ElMessage.info(store.t('Listening... Speak now.'));
    };
    recognition.onerror = () => {
      listening.value = false;
      ElMessage.error(store.t('Voice recognition error.'));
    };
    recognition.onend = () => {
      listening.value = false;
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscribed(transcript);
      ElMessage.success(store.t('Voice transcribed!'));
    };
    recognition.start();
  };

  const speakText = (text: string) => {
    const clean = text
      .replace(/\[[\s\S]*?\]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[*#`_\-]/g, '')
      .trim();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  return {
    listening,
    toggleVoiceListening,
    speakText
  };
}
