export class Skill {
  constructor({ name, key, cooldown, activate }) {
    this.name = name;
    this.key = key;
    this.cooldown = cooldown; // seconds
    this.remaining = 0;
    this.onActivate = activate;
    this.lastUsed = -Infinity;
  }

  canActivate(now) {
    return (now - this.lastUsed) > this.cooldown * 1000;
  }

  activate(now, ...params) {
    if (this.canActivate(now)) {
      this.lastUsed = now;
      this.onActivate(...params);
      this.remaining = this.cooldown;
    }
  }
}

export function createSkills(api) {
  // api: { scene, claw, items, addScore, feedback }
  return [
    new Skill({
      name: 'Magnet',
      key: 'q',
      cooldown: 10,
      activate: () => {
        api.feedback('Magnet!');
        // Pull all items within radius towards claw for 2s
        const radius = 5;
        const center = api.claw.mesh.position.clone();
        api.items().forEach(item => {
          if (item.mesh.position.distanceTo(center) < radius) {
            // Animate item to claw over 0.5s
            const start = item.mesh.position.clone();
            const end = center.clone().add(new THREE.Vector3(0, -1, 0));
            let t = 0;
            const step = () => {
              t += 0.04;
              item.mesh.position.lerpVectors(start, end, Math.min(t * 2, 1));
              if (t < 0.5) requestAnimationFrame(step);
            };
            step();
          }
        });
      }
    }),
    new Skill({
      name: 'Bomb',
      key: 'w',
      cooldown: 15,
      activate: () => {
        api.feedback('Bomb!');
        // Remove all visible stones and bones for instant points
        let removed = 0;
        api.items().forEach(item => {
          if (item.type === 'stone' || item.type === 'bone') {
            api.scene.remove(item.mesh);
            api.addScore(item.score);
            removed++;
          }
        });
        if (removed === 0) api.feedback('No stones or bones!');
      }
    }),
    new Skill({
      name: 'Slow Time',
      key: 'e',
      cooldown: 20,
      activate: () => {
        api.feedback('Slow Time!');
        // Temporarily slow claw swing and launch speed for 5s
        api.claw.slowTime(0.4, 5000); // 40% speed, 5s
      }
    }),
  ];
}