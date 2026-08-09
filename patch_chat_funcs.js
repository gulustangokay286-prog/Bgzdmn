const fs = require('fs');
const path = 'src/views/ChatView.jsx';
let content = fs.readFileSync(path, 'utf8');

const functionsToAdd = `
  const uploadFileToCloudinary = async (file, type) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default');
    formData.append('folder', 'ial-mobil/chat');

    const resourceType = type === 'audio' || type === 'video' ? 'video' : 'auto';
    try {
      const response = await fetch(\`https://api.cloudinary.com/v1_1/dbfhcj6px/\${resourceType}/upload\`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Cloudinary upload failed');
      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice_message.webm', { type: 'audio/webm' });
        setSelectedFile(file);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Mic access denied:", error);
      alert("Mikrofon erişimi reddedildi.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return \`\${m}:\${s < 10 ? '0' : ''}\${s}\`;
  };
`;

const handleSendMessageCode = `
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !activeUser) return;

    const partnerId = activeUser.name.split('/').pop() || activeUser.id || activeUser.uid;
    const convoId = activeConversationId || [adminId, partnerId].sort().join('_');
    const content = newMessage.trim();
    setNewMessage('');

    // Reset my typing state immediately
    const myTypingRef = ref(rtdb, \`/typing/\${convoId}/\${adminId}\`);
    set(myTypingRef, false);

    try {
      let fileUrl = null;
      let msgType = 'text';

      if (selectedFile) {
        if (selectedFile.type.startsWith('image/')) msgType = 'image';
        else if (selectedFile.type.startsWith('audio/')) msgType = 'audio';
        else if (selectedFile.type.startsWith('video/')) msgType = 'video';
        else msgType = 'file';
        
        fileUrl = await uploadFileToCloudinary(selectedFile, msgType);
        setSelectedFile(null); // Clear after upload
      }

      const msgObj = {
        senderId: adminId,
        type: msgType,
        content: content,
        fileUrl: fileUrl,
        createdAt: serverTimestamp(),
        deliveryState: 'sent',
        readBy: [adminId]
      };
      
      await addDoc(collection(db, \`conversations/\${convoId}/messages\`), msgObj);
      
      await updateDoc(doc(db, \`conversations\`, convoId), {
        latestMessage: msgType === 'text' ? content : (msgType === 'audio' ? '🎤 Sesli Mesaj' : (msgType === 'image' ? '📷 Fotoğraf' : '📁 Dosya')),
        latestMessageTimestamp: serverTimestamp(),
        latestMessageSenderId: adminId,
        updatedAt: serverTimestamp()
      });
`;

content = content.replace('  const handleSendMessage = async (e) => {', functionsToAdd + '\n' + handleSendMessageCode);

// Remove the old handleSendMessage body until the try catch ends. Wait, we can just replace the old try body.
// Instead of replacing the top, let's do a smarter replacement.
