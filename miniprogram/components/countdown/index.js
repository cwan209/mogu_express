// components/countdown/index.js
const { remaining } = require('../../utils/date.js');

Component({
  properties: {
    target:  { type: String, value: '' },             // ISO 时间
    prefix:  { type: String, value: '距截止' },
    // 'before' 模式:target 是开始时间,显示距开团;否则默认距截止
    mode:    { type: String, value: 'end' },
  },
  data: {
    text: '',
    expired: false,
  },
  lifetimes: {
    attached() {
      this.tick();
      this.timer = setInterval(() => this.tick(), 1000);
    },
    detached() {
      if (this.timer) clearInterval(this.timer);
    },
  },
  observers: {
    target() { this.tick(); },
  },
  methods: {
    tick() {
      const r = remaining(this.properties.target);
      if (r.expired) {
        this.setData({ expired: true, text: this.properties.mode === 'before' ? '已开团' : '已结束' });
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        return;
      }
      let text;
      if (r.days > 0)      text = `${r.days}天${r.hours}小时`;
      else if (r.hours > 0) text = `${r.hours}小时${r.minutes}分`;
      else                  text = `${r.minutes}分${String(r.seconds).padStart(2, '0')}秒`;
      this.setData({ expired: false, text });
    },
  },
});
