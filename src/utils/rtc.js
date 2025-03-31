import AgoraRTC, {ClientRole} from 'agora-rtc-sdk-ng';

export class RTCService {
  constructor() {
    this.client = null;
    this.remoteAudioTrack = null;
    this.remoteVideoTrack = null;
    this.localAudioTrack = null;
    this.localVideoTrack = null;
    this.status = 'disconnected'; // disconnected, connecting, connected, error
    this.messageHandlers = new Map();
    this.appId = null;
  }

  // 初始化RTC客户端
  async init(appId) {
    try {
      this.appId = appId
      this.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      this.status = 'connecting';
      this.messageHandlers.get('status')?.('RTC初始化中...');
      return true;
    } catch (error) {
      console.error('RTC init error:', error);
      this.status = 'error';
      this.messageHandlers.get('error')?.(error);
      return false;
    }
  }

  // 加入频道
  async joinChannel(mirrorCode,channelName, token) {
    try {
      if (!this.client) {
        throw new Error('RTC client not initialized');
      }

      if (!this.appId) {
        throw new Error('RTC appId not set');
      }

      if (!channelName) {
        throw new Error('Channel name is required');
      }

      if (!token) {
        throw new Error('Token is required');
      }

      console.log('正在加入频道:', {
        appId: this.appId,
        channel: channelName,
        token: token
      });

      this.messageHandlers.get('status')?.(`正在加入频道: ${channelName}`);

      // 加入频道
      const uid = await this.client.join(this.appId, channelName, token,parseInt(mirrorCode),null);
      console.log('成功加入频道，用户ID:', uid);
      this.messageHandlers.get('status')?.(`成功加入频道，用户ID: ${uid}`);

      // 监听远端用户发布事件
      this.client.on('user-published', async (user, mediaType) => {
        console.log('收到远端用户发布:', {
          uid: user.uid,
          mediaType: mediaType
        });
        this.messageHandlers.get('status')?.(`收到${mediaType}流，正在订阅...`);
        
        try {
          await this.client.subscribe(user, mediaType);
          console.log('订阅成功:', mediaType);
          
          if (mediaType === 'audio') {
            this.remoteAudioTrack = user.audioTrack;
            this.messageHandlers.get('audio')?.(user.audioTrack);
            this.messageHandlers.get('status')?.('音频流订阅成功');
          } else if (mediaType === 'video') {

            this.remoteVideoTrack = user.videoTrack;
            this.messageHandlers.get('video')?.(user.videoTrack);
            this.messageHandlers.get('status')?.('视频流订阅成功');
          }
        } catch (error) {
          console.error('订阅失败:', error);
          this.messageHandlers.get('error')?.({
            message: `订阅${mediaType}失败: ${error.message}`
          });
        }
      });

      // 监听远端用户取消发布事件
      this.client.on('user-unpublished', (user, mediaType) => {
        console.log('用户取消发布:', {
          uid: user.uid,
          mediaType: mediaType
        });
        this.messageHandlers.get('status')?.(`用户取消发布${mediaType}流`);
        if (mediaType === 'audio') {
          if (this.remoteAudioTrack) {
            this.remoteAudioTrack.stop();
            this.remoteAudioTrack = null;
          }
        } else if (mediaType === 'video') {
          if (this.remoteVideoTrack) {
            this.remoteVideoTrack.stop();
            this.remoteVideoTrack = null;
          }
        }
      });

      // 监听远端用户离开事件
      this.client.on('user-left', (user) => {
        console.log('用户离开:', user.uid);
        this.messageHandlers.get('status')?.(`用户 ${user.uid} 离开频道`);
        this.messageHandlers.get('user-left')?.(user);
      });

      // 监听连接状态变化
      this.client.on('connection-state-change', (curState, prevState, reason) => {
        console.log('连接状态变化:', {
          from: prevState,
          to: curState,
          reason: reason
        });
        this.messageHandlers.get('status')?.(`连接状态变化: ${prevState} -> ${curState} (${reason})`);
      });

      this.status = 'connected';
      return true;
    } catch (error) {
      console.error('Join channel error:', error);
      this.status = 'error';
      this.messageHandlers.get('error')?.(error);
      return false;
    }
  }

  // 离开频道
  async leaveChannel() {
    try {
      if (this.client) {
        this.messageHandlers.get('status')?.('正在离开频道...');
        
        // 停止并关闭所有音视频轨道
        if (this.remoteAudioTrack) {
          this.remoteAudioTrack.stop();
        }
        if (this.remoteVideoTrack) {
          this.remoteVideoTrack.stop();
        }
        if (this.localAudioTrack) {
          this.localAudioTrack.stop();
        }
        if (this.localVideoTrack) {
          this.localVideoTrack.stop();
        }

        // 离开频道
        await this.client.leave();
        this.status = 'disconnected';
        this.messageHandlers.get('status')?.('已离开频道');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Leave channel error:', error);
      this.status = 'error';
      this.messageHandlers.get('error')?.(error);
      return false;
    }
  }

  // 注册消息处理器
  on(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  // 移除消息处理器
  off(type) {
    this.messageHandlers.delete(type);
  }

  // 获取连接状态
  getStatus() {
    return this.status;
  }

  // 获取远端视频轨道
  getRemoteVideoTrack() {
    return this.remoteVideoTrack;
  }

  // 获取远端音频轨道
  getRemoteAudioTrack() {
    return this.remoteAudioTrack;
  }
} 