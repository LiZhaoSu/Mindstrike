export class ComboManager {
  constructor(onCombo) {
    this.lastType = null;
    this.streak = 0;
    this.comboThreshold = 2; // Minimum count for bonus
    this.onCombo = onCombo;
  }

  onGrab(type) {
    if (type === this.lastType) {
      this.streak += 1;
    } else {
      this.streak = 1;
      this.lastType = type;
    }

    if (this.streak >= this.comboThreshold) {
      // Calculate bonus, e.g., +50% per extra grab
      const bonusMultiplier = 1 + 0.5 * (this.streak - this.comboThreshold + 1);
      this.onCombo(type, this.streak, bonusMultiplier);
      return bonusMultiplier;
    }
    return 1;
  }

  reset() {
    this.lastType = null;
    this.streak = 0;
  }
}