import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
export async function mockYouTube(page: Page, { total = 120, fail = false } = {}) {
  const queries: string[] = []
  await page.route('https://i.ytimg.com/**', (route) =>
    route.fulfill({ path: 'public/app-icon-192.png' }),
  )
  await page.route('**/api/youtube/search?**', (route) => {
    const url = new URL(route.request().url()),
      q = url.searchParams.get('q') || ''
    queries.push(q)
    if (fail)
      return route.fulfill({
        status: 502,
        json: { message: 'Не удалось получить результаты YouTube.' },
      })
    const offset = Number(url.searchParams.get('pageToken') || 0)
    return route.fulfill({
      json: {
        items: Array.from({ length: Math.min(20, total - offset) }, (_, i) => ({
          id: `vid${String(offset + i).padStart(8, '0')}`,
          title: offset + i === 0 ? 'ØDEN — Blink' : `YouTube song ${offset + i}`,
          channel: 'ØDEN - Topic',
          duration: 170 + i,
        })),
        nextPageToken: offset + 20 < total ? String(offset + 20) : undefined,
      },
    })
  })
  return queries
}

// Public IFrame API methods drive an actual audio element in a cross-origin frame.
// Only the external provider is replaced; UI controls, timing, volume and storage stay real.
export async function mockYouTubePlayback(page: Page, blockedIds: string[] = []) {
  const audio = (await readFile('public/audio/blue-hour.mp3')).toString('base64')
  await page.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.YT={Player:class {
      constructor(element,options){
        this.time=0;this.duration=0;this.state=2;this.options=options;
        this.frame=document.createElement('iframe');
        this.frame.src=options.host+'/embed/'+options.videoId+'?'+new URLSearchParams(options.playerVars);
        this.frame.width=options.width;this.frame.height=options.height;
        this.frame.allow='autoplay';this.frame.title='YouTube fixture';
        this.listener=(event)=>{
          if(event.source!==this.frame.contentWindow||event.origin!==options.host)return;
          const data=event.data;
          if(!data||data.fixture!=='youtube')return;
          this.time=data.time;this.duration=data.duration;this.state=data.state;
          if(data.event==='ready')options.events.onReady({target:this});
          if(data.event==='state')options.events.onStateChange({target:this,data:data.state});
          if(data.event==='error')options.events.onError({target:this,data:data.code});
        };
        window.addEventListener('message',this.listener);element.replaceWith(this.frame);
      }
      command(command,value){this.frame.contentWindow.postMessage({command,value},this.options.host)}
      playVideo(){this.command('play')}
      pauseVideo(){this.command('pause')}
      seekTo(seconds){this.command('seek',seconds)}
      setVolume(volume){this.command('volume',volume)}
      getCurrentTime(){return this.time}
      getDuration(){return this.duration}
      getPlayerState(){return this.state}
      getIframe(){return this.frame}
      destroy(){window.removeEventListener('message',this.listener);this.frame.remove()}
    }};window.onYouTubeIframeAPIReady();`,
    }),
  )
  await page.route('https://www.youtube-nocookie.com/**', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0;background:#101727;color:white;font:14px sans-serif"><p>Official player fixture</p>
      <audio src="data:audio/mpeg;base64,${audio}"></audio><script>
      const audio=document.querySelector('audio');
      const target=new URL(location.href).searchParams.get('origin');
      function emit(event,code){parent.postMessage({fixture:'youtube',event,code,time:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:0,state:audio.ended?0:audio.paused?2:1},target)}
      let ready=false;function sendReady(){if(!ready){ready=true;emit('ready')}}
      audio.onloadedmetadata=sendReady;setTimeout(sendReady,500);
      audio.onplay=()=>emit('state');audio.onpause=()=>emit('state');audio.onended=()=>emit('state');
      audio.ontimeupdate=()=>emit('time');audio.onseeked=()=>emit('time');
      window.addEventListener('message',event=>{
        if(event.source!==parent||event.origin!==target)return;
        const {command,value}=event.data||{};
        if(command==='play'){
          if(${blockedIds.includes(id || '')})emit('error',150);
          else audio.play();
        }
        if(command==='pause')audio.pause();
        if(command==='seek'){audio.currentTime=value;emit('time')}
        if(command==='volume')audio.volume=value/100;
      });
      </script></body></html>`,
    })
  })
}
