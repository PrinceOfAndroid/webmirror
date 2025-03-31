<template>
  <div class="mirror-code">
    <div class="mirror-container">
      <div class="mirror-header">
        <h2>屏幕镜像</h2>
        <div class="mirror-actions">
          <el-button type="primary" @click="startMirror" :loading="loading">开始镜像</el-button>
          <el-button type="danger" @click="stopMirror" :disabled="!isMirroring">停止镜像</el-button>
        </div>
      </div>

      <div class="mirror-content">
        <div class="mirror-info">
          <div class="info-section">
            <h3>投屏信息</h3>
            <div class="info-item">
              <span class="label">镜像码：</span>
              <span class="value">{{ mirrorCode }}</span>
            </div>
            <div class="info-item">
              <span class="label">认证令牌：</span>
              <span class="value">{{ authToken }}</span>
            </div>
          </div>

          <div class="info-section">
            <h3>连接状态</h3>
            <div class="info-item">
              <span class="label">WebSocket状态：</span>
              <span class="value" :class="wsStatus">{{ wsStatusText }}</span>
            </div>
            <div class="info-item">
              <span class="label">RTC状态：</span>
              <span class="value" :class="rtcStatus">{{ rtcStatusText }}</span>
            </div>
          </div>

          <div class="info-section">
            <h3>设备信息</h3>
            <div class="info-item">
              <span class="label">设备ID：</span>
              <span class="value">{{ deviceId }}</span>
            </div>
            <div class="info-item">
              <span class="label">设备名称：</span>
              <span class="value">{{ deviceName }}</span>
            </div>
          </div>
        </div>

        <div class="video-container">
          <div ref="remoteVideo" class="remote-video"></div>
        </div>

        <div class="mirror-preview">
          <div class="preview-header">
            <h3>预览区域</h3>
            <el-button type="text" @click="clearMessages">清除消息</el-button>
          </div>
          <div class="preview-content" ref="previewContent">
            <div v-for="(message, index) in messages" :key="index" class="message-item">
              <span class="message-time">{{ message.time }}</span>
              <span class="message-type" :class="message.type">{{ message.type }}</span>
              <span class="message-content">{{ message.content }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { getMirrorCode, anonymousLogin } from '@/api/mirror';
import { WebSocketService } from '@/utils/websocket';
import { RTCService } from '@/utils/rtc';

export default {
  name: 'MirrorCode',
  setup() {
    const loading = ref(false);
    const isMirroring = ref(false);
    const mirrorCode = ref('');
    const authToken = ref('');
    const wsStatus = ref('disconnected');
    const wsStatusText = ref('未连接');
    const rtcStatus = ref('disconnected');
    const rtcStatusText = ref('未连接');
    const deviceId = ref('');
    const deviceName = ref('');
    const wsService = new WebSocketService();
    const rtcService = new RTCService();
    const messages = ref([]);
    const previewContent = ref(null);
    const remoteVideo = ref(null);

    // 添加消息到列表
    const addMessage = (type, content) => {
      const time = new Date().toLocaleTimeString();
      messages.value.push({
        time,
        type,
        content: typeof content === 'object' ? JSON.stringify(content, null, 2) : content
      });
      
      // 滚动到底部
      nextTick(() => {
        if (previewContent.value) {
          previewContent.value.scrollTop = previewContent.value.scrollHeight;
        }
      });
    };

    // 清除消息
    const clearMessages = () => {
      messages.value = [];
    };

    // 开始镜像
    const startMirror = async () => {
      try {
        loading.value = true;
        // 1. 先进行匿名登录
        const loginRes = await anonymousLogin();
        if (loginRes.status !== 200) {
          throw new Error('匿名登录失败');
        }
        addMessage('info', '匿名登录成功');

        // 2. 使用登录返回的token获取投屏码
        const codeRes = await getMirrorCode(loginRes.data.api_token);
        if (codeRes.status !== 200) {
          throw new Error('获取投屏码失败');
        }
        addMessage('info', '获取投屏码成功');

        // 3. 设置投屏信息
        mirrorCode.value = codeRes.data.code;
        authToken.value = codeRes.data.auth;
        deviceId.value = codeRes.data.hash || '';
        deviceName.value = codeRes.data.name || '';
        isMirroring.value = true;

        // 4. 初始化RTC
        const rtcInitSuccess = await rtcService.init(process.env.VUE_APP_AGORA_APP_ID);
        if (!rtcInitSuccess) {
          throw new Error('RTC初始化失败');
        }

        // 5. 将RTC服务传递给WebSocket服务
        wsService.setRTCService(rtcService);

        // 6. 连接WebSocket
        wsService.connect(authToken.value);
      } catch (error) {
        console.error('Start mirror error:', error);
        ElMessage.error(error.message || '启动镜像失败');
      } finally {
        loading.value = false;
      }
    };

    // 处理WebSocket消息
    const handleWsMessage = (data) => {
      addMessage('message', data);
      
      // 处理频道分配消息
      if (data.status === 110) {
        const { channel_name, token } = data.data;
        rtcService.joinChannel(channel_name, token);
      }
      
      // 处理停止分享消息
      if (data.status === 204) {
        stopMirror();
      }
      
      // 处理认证失败消息
      if (data.status === 101) {
        ElMessage.error('认证失败，请重新连接');
        stopMirror();
      }
      
      // 处理区域限制消息
      if (data.status === 106) {
        ElMessage.error('当前区域不支持投屏');
        stopMirror();
      }
    };

    // 处理原始消息
    const handleRawMessage = (data) => {
      addMessage('raw', data);
    };

    // 处理心跳消息
    const handleHeartbeat = (data) => {
      addMessage('heartbeat', data);
    };

    // 自动开始连接
    const autoConnect = async () => {
      try {
        await startMirror();
      } catch (error) {
        console.error('Auto connect error:', error);
      }
    };

    // 停止镜像
    const stopMirror = async () => {
      wsService.disconnect();
      await rtcService.leaveChannel();
      isMirroring.value = false;
      addMessage('info', '停止镜像');
    };

    // 监听WebSocket状态变化
    const updateWsStatus = () => {
      const status = wsService.getStatus();
      wsStatus.value = status;
      wsStatusText.value = {
        disconnected: '未连接',
        connecting: '连接中',
        connected: '已连接',
        error: '连接错误'
      }[status];
    };

    // 监听RTC状态变化
    const updateRTCStatus = () => {
      const status = rtcService.getStatus();
      rtcStatus.value = status;
      rtcStatusText.value = {
        disconnected: '未连接',
        connecting: '连接中',
        connected: '已连接',
        error: '连接错误'
      }[status];
    };

    // 处理远端视频流
    const handleRemoteVideo = (videoTrack) => {
      if (remoteVideo.value) {
        videoTrack.play(remoteVideo.value);
        addMessage('info', '收到远端视频流');
      }
    };

    // 处理远端音频流
    const handleRemoteAudio = (audioTrack) => {
      audioTrack.play();
      addMessage('info', '收到远端音频流');
    };

    // 处理用户离开
    const handleUserLeft = (user) => {
      addMessage('info', `用户 ${user.uid} 离开频道`);
    };

    // 处理RTC错误
    const handleRTCError = (error) => {
      addMessage('error', `RTC错误: ${error.message}`);
      ElMessage.error('视频连接错误');
    };

    onMounted(() => {
      // 注册WebSocket消息处理器
      wsService.on('message', handleWsMessage);
      wsService.on('raw', handleRawMessage);
      wsService.on('heartbeat', handleHeartbeat);

      // 注册RTC消息处理器
      rtcService.on('video', handleRemoteVideo);
      rtcService.on('audio', handleRemoteAudio);
      rtcService.on('user-left', handleUserLeft);
      rtcService.on('error', handleRTCError);
      rtcService.on('status', handleRTCStatus);

      // 监听WebSocket状态变化
      const wsStatusCheckInterval = setInterval(updateWsStatus, 1000);
      const rtcStatusCheckInterval = setInterval(updateRTCStatus, 1000);

      // 自动开始连接
      autoConnect();

      // 组件卸载时清理
      onUnmounted(() => {
        clearInterval(wsStatusCheckInterval);
        clearInterval(rtcStatusCheckInterval);
        wsService.off('message');
        wsService.off('raw');
        wsService.off('heartbeat');
        rtcService.off('video');
        rtcService.off('audio');
        rtcService.off('user-left');
        rtcService.off('error');
        rtcService.off('status');
        wsService.disconnect();
        rtcService.leaveChannel();
      });
    });

    return {
      loading,
      isMirroring,
      mirrorCode,
      authToken,
      wsStatus,
      wsStatusText,
      rtcStatus,
      rtcStatusText,
      deviceId,
      deviceName,
      messages,
      previewContent,
      remoteVideo,
      startMirror,
      stopMirror,
      clearMessages
    };
  }
};
</script>

<style scoped>
.mirror-code {
  padding: 20px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
}

.mirror-container {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.mirror-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.mirror-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mirror-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-section {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.info-section h3 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 16px;
}

.info-section:last-child {
  margin-bottom: 0;
}

.info-item {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item .label {
  font-weight: bold;
  margin-right: 10px;
  color: #606266;
  min-width: 100px;
}

.info-item .value {
  color: #303133;
  word-break: break-all;
}

.info-item .value.connected {
  color: #67c23a;
}

.info-item .value.connecting {
  color: #e6a23c;
}

.info-item .value.error {
  color: #f56c6c;
}

.video-container {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  background: #000;


}

.remote-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.mirror-preview {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: #f5f7fa;
  border-bottom: 1px solid #dcdfe6;
}

.preview-content {
  height: 300px;
  overflow-y: auto;
  padding: 15px;
  background: #fff;
}

.message-item {
  margin-bottom: 10px;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.5;
}

.message-time {
  color: #909399;
  margin-right: 10px;
}

.message-type {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  margin-right: 10px;
  font-size: 12px;
}

.message-type.info {
  background: #ecf5ff;
  color: #409eff;
}

.message-type.message {
  background: #f0f9eb;
  color: #67c23a;
}

.message-type.heartbeat {
  background: #fdf6ec;
  color: #e6a23c;
}

.message-type.rtc-status {
  background: #f0f9eb;
  color: #67c23a;
}

.message-type.error {
  background: #fef0f0;
  color: #f56c6c;
}

.message-content {
  color: #303133;
  word-break: break-all;
}
</style> 