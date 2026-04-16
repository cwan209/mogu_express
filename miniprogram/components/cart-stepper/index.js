// components/cart-stepper/index.js
Component({
  properties: {
    value: { type: Number, value: 1 },
    min:   { type: Number, value: 0 },
    max:   { type: Number, value: 99 },
    disabled: { type: Boolean, value: false },
  },
  methods: {
    onMinus() {
      if (this.properties.disabled) return;
      const v = Math.max(this.properties.min, this.properties.value - 1);
      this.triggerEvent('change', { value: v });
    },
    onPlus() {
      if (this.properties.disabled) return;
      const v = Math.min(this.properties.max, this.properties.value + 1);
      this.triggerEvent('change', { value: v });
    },
  },
});
