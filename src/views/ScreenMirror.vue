<template>
  <div class="screen-mirror">
    <div class="mirror-container">
      <div class="mirror-header">
        <h2>屏幕镜像</h2>
      </div>

      <div class="mirror-content">
        <!-- 左侧信息栏 -->
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
            <h3>频道信息</h3>
            <div class="info-item">
              <span class="label">频道名称：</span>
              <span class="value">{{ channelName || '等待分配' }}</span>
            </div>
            <div class="info-item">
              <span class="label">频道令牌：</span>
              <span class="value token-value">{{ channelToken || '等待分配' }}</span>
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

        <!-- 右侧内容区 -->
        <div class="mirror-main">
          <div class="video-container">
            <div v-show="!hasRemoteVideo" class="no-video">
              <span>等待视频流...</span>
            </div>
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
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { getMirrorCode, anonymousLogin } from '@/api/mirror';
import { WebSocketService } from '@/utils/websocket';
import { RTCService } from '@/utils/rtc';

export default {
  name: 'ScreenMirror',
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
    const channelName = ref('');
    const channelToken = ref('');
    const wsService = new WebSocketService();
    const rtcService = new RTCService();
    const messages = ref([]);
    const previewContent = ref(null);
    const remoteVideo = ref(null);
    const hasRemoteVideo = ref(false);
    const hasRemoteAudio = ref(false);
    const videoWidth = ref(0);
    const videoHeight = ref(0);

    // 添加消息到列表
    const addMessage = (type, content) => {
      const time = new Date().toLocaleTimeString();
      messages.value.push({
        time,
        type,
        content: typeof content === 'object' ? JSON.stringify(content, null, 2) : content
      });
      
      // 使用 nextTick 确保在DOM更新后再滚动
      nextTick(() => {
        scrollToBottom();
      });
    };

    // 滚动到底部的方法
    const scrollToBottom = () => {
      if (previewContent.value) {
        const scrollHeight = previewContent.value.scrollHeight;
        previewContent.value.scrollTop = scrollHeight;
      }
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
        const rtcInitSuccess = await rtcService.init(import.meta.env.VITE_AGORA_APP_ID);
        if (!rtcInitSuccess) {
          throw new Error('RTC初始化失败');
        }

        // 5. 将RTC服务传递给WebSocket服务
        wsService.setRTCService(rtcService);

        // 6. 连接WebSocket
        wsService.connect(authToken.value,mirrorCode.value);
      } catch (error) {
        console.error('Start mirror error:', error);
        ElMessage.error(error.message || '启动镜像失败');
      } finally {
        loading.value = false;
      }
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

    // 监听WebSocket消息
    const handleWsMessage = (data) => {
      addMessage('message', data);
      
      // 处理频道分配消息
      if (data.type === 'channel') {
        channelName.value = data.data.channel;
        channelToken.value = data.data.token;
      }
    };

    // 监听原始消息
    const handleRawMessage = (data) => {
      try {
        // 尝试解析JSON
        const jsonData = JSON.parse(data);
        addMessage('message', jsonData);
      } catch (error) {
        // 如果不是JSON，则作为原始消息显示
        addMessage('raw', data);
      }
    };

    // 监听心跳消息
    const handleHeartbeat = (data) => {
      addMessage('heartbeat', data);
    };

    // 处理远端视频流
    const handleRemoteVideo = (videoTrack) => {
      if (remoteVideo.value) {
        // 先清理可能存在的旧视频
        remoteVideo.value.innerHTML = '';
        videoTrack.on("first-frame-decoded",()=>{
          addMessage('info', `视频第一帧加载`);
        })
        videoTrack.on("video-size-changed", (width, height) => {
          console.log("视频尺寸变化 - Width:", width, "Height:", height);
          videoWidth.value = width;
          videoHeight.value = height;
          addMessage('info', `视频尺寸更新: ${width}x${height}`);
        });

        // Web SDK配置示例
        const config = {
          mirror: false,
          fit: "contain",
        };


        // 播放新视频
        videoTrack.play(remoteVideo.value,config);


        // 监听视频尺寸变化

        hasRemoteVideo.value = true;
        addMessage('info', '收到远端视频流，开始播放');
      }
    };

    // 处理远端音频流
    const handleRemoteAudio = (audioTrack) => {
      audioTrack.play();
      hasRemoteAudio.value = true;
      addMessage('info', '收到远端音频流，开始播放');
    };

    // 处理用户离开
    const handleUserLeft = (user) => {
      addMessage('info', `用户 ${user.uid} 离开频道`);
      hasRemoteVideo.value = false;
      hasRemoteAudio.value = false;
    };

    // 处理RTC状态
    const handleRTCStatus = (status) => {
      addMessage('rtc-status', status);
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
      startMirror();

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
      channelName,
      channelToken,
      messages,
      previewContent,
      remoteVideo,
      clearMessages,
      hasRemoteVideo,
      hasRemoteAudio,
      videoWidth,
      videoHeight,
    };
  }
};
</script>

<style scoped>
.screen-mirror {
  width: 100vw;
  height: 100vh;
  background-color: #f5f7fa;
  box-sizing: border-box;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.mirror-container {
  width: 100%;
  height: 100%;
  background: #fff;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.mirror-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.mirror-header h2 {
  margin: 0;
  color: #303133;
  font-size: 24px;
}

.mirror-content {
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
}

.mirror-info {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 20px;
}

.mirror-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 20px;
  overflow: hidden;
  height: calc(100vh - 100px);
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

.info-item {
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item .label {
  font-weight: bold;
  color: #606266;
  min-width: 100px;
  flex-shrink: 0;
}

.info-item .value {
  color: #303133;
  word-break: break-all;
  flex: 1;
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
  height: 0;
  padding-bottom: 40%;
  background: #000;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 20px;
  position: relative;
  flex-shrink: 0;
}

.no-video {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #909399;
  font-size: 16px;
  background: #000;
  z-index: 1;
}

.remote-video {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;

}

/* 针对Agora RTC视频元素的样式 */
.remote-video > div {
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  background: #000;
}

.remote-video video {
  width: 100%;
  height: 100%;
  object-fit: fill;
}

.mirror-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  min-height: 0; /* 确保flex布局正确工作 */
}

.preview-header {
  padding: 10px 15px;
  background: #f5f7fa;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.preview-header h3 {
  margin: 0;
  font-size: 16px;
}

.preview-content {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.message-item {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0; /* 防止消息被压缩 */
}

.message-item:last-child {
  margin-bottom: 15px; /* 给最后一条消息底部留出空间 */
  padding-bottom: 0;
  border-bottom: none;
}

.message-time {
  display: inline-block;
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

.message-type.raw {
  background: #f4f4f5;
  color: #909399;
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
  display: block;
  margin-top: 5px;
  word-break: break-all;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.5;
}

.token-value {
  word-break: break-all;
  font-family: monospace;
  font-size: 12px;
}
</style> 