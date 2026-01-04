(() => {
  const apiKey = ""; // Add API Key here if you want the AI advisor

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const keyOf = (x, z) => `${x},${z}`;

  const game = {
    DAY_DURATION: 360,
    NIGHT_DURATION: 120,
    WORLD_SIZE: 42,

    // Worker system
    USE_WORKERS: true,
    workers: [],
    nextWorkerId: 1,

    resources: { wood: 40, stone: 20, food: 20, crystal: 0, archerItems: 0, cannonItems: 0 },

    mc: {
      hp: 100, maxHp: 100,
      hunger: 100, thirst: 100,
      mesh: null, speed: 2.5,
      miningTarget: null,
      legs: [],
      pickaxe: null,
      targetPos: null,
    },

    mode: "gather",
    isNight: false,
    cycleTimer: 360,
    dayCount: 1,
    active: false,

    buildingCounts: { lumber: 0, quarry: 0, factory: 0, blacksmith: 0, barracks: 0, core: 0 },

    grid: {},
    entities: [],
    projectiles: [],
    particles: [],
    selectedBuilding: null,

    geminiBusy: false,

    // ===== DEMO WAVE SETTINGS =====
    MAX_NIGHTS: 5,
    N1_MIN: 6,
    N1_MAX: 7,

    spawnQueue: 0,
    spawnIndexThisNight: 0,
    nextSpawnTime: 0,

    awaitingBoss: false,
    bossSpawned: false,
    bossDefeated: false,

    // === ZOOM SETTINGS ===
    // 1.4 = Closer to MC (Mobile), 1.2 = Standard (PC)
    targetZoom: window.innerWidth < 850 ? 1.4 : 1.2, 
    lastTouchDist: 0, // For pinch-to-zoom

    worldBuilt: false,

    waterTiles: new Set(),
    crystalTiles: new Set(),
    coreTile: null,
    campfireTiles: new Set(),

    story: { overlay: null, step: 0, active: false, lines: [] },

    ui: {
      wood: document.getElementById("wood"),
      stone: document.getElementById("stone"),
      crystal: document.getElementById("crystal"),
      food: document.getElementById("food"),
      timer: document.getElementById("timer-text"),
      label: document.getElementById("cycle-label"),
      invArcher: document.getElementById("inv-archer"),
      invCannon: document.getElementById("inv-cannon"),
      skipBtn: document.getElementById("btn-skip"),
      summonBtn: document.getElementById("btn-summon"),
      advisorBtn: document.getElementById("btn-advisor"),
      inspector: document.getElementById("inspector-panel"),
      inspTitle: document.getElementById("inspector-title"),
      inspStats: document.getElementById("inspector-stats"),
      inspBtns: document.getElementById("inspector-buttons"),
      menuContainer: document.getElementById("main-menu-container"),
      waveInfo: document.getElementById("wave-info"),
      hpFill: document.getElementById("hp-fill"),
      hungerFill: document.getElementById("hunger-fill"),
      thirstFill: document.getElementById("thirst-fill"),
      startScreen: document.getElementById("start-screen"),
      howModal: document.getElementById("howto-modal"),
      btnStart: document.getElementById("btn-start"),
      btnHow: document.getElementById("btn-how"),
      btnCloseHow: document.getElementById("btn-close-how")
    },

    safeNumber(v, fallback = 0) {
      return Number.isFinite(v) ? v : fallback;
    },

    init() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x87CEEB);
      this.scene.fog = new THREE.Fog(0x87CEEB, 20, 65);

      const aspect = window.innerWidth / window.innerHeight;
      this.camera = new THREE.OrthographicCamera(-14 * aspect, 14 * aspect, 14, -14, 1, 1000);
      this.camera.position.set(20, 20, 20);
      this.camera.lookAt(0, 0, 0);
      
      // Apply initial zoom
      this.camera.zoom = this.targetZoom;
      this.camera.updateProjectionMatrix();

      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      document.body.appendChild(this.renderer.domElement);

      this.scene.add(new THREE.AmbientLight(0x98a0b3, 0.7));

      this.mainLight = new THREE.DirectionalLight(0xffffff, 1.25);
      this.mainLight.position.set(18, 28, 12);
      this.mainLight.castShadow = true;
      this.mainLight.shadow.mapSize.width = 2048;
      this.mainLight.shadow.mapSize.height = 2048;
      this.mainLight.shadow.camera.near = 0.5;
      this.mainLight.shadow.camera.far = 140;
      this.mainLight.shadow.camera.left = -40;
      this.mainLight.shadow.camera.right = 40;
      this.mainLight.shadow.camera.top = 40;
      this.mainLight.shadow.camera.bottom = -40;
      this.mainLight.shadow.bias = -0.0004;
      this.scene.add(this.mainLight);

      this.sun = new THREE.Mesh(
        new THREE.SphereGeometry(2.4, 18, 18),
        new THREE.MeshBasicMaterial({ color: 0xffd27d })
      );
      this.sun.position.set(26, 24, -10);
      this.scene.add(this.sun);

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      this.cursor = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.42, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.55, transparent: true })
      );
      this.cursor.rotation.x = -Math.PI / 2;
      this.scene.add(this.cursor);

      // --- EVENTS ---
      // Mouse events
      this.renderer.domElement.addEventListener("pointerdown", e => this.onPointerDown(e));
      this.renderer.domElement.addEventListener("pointermove", e => this.onPointerMove(e));
      this.renderer.domElement.addEventListener("pointerup", e => this.onPointerUp(e));

      // --- PINCH TO ZOOM & TOUCH LOGIC ---
      this.renderer.domElement.addEventListener("touchstart", e => {
          if(e.target === this.renderer.domElement) e.preventDefault();
          
          // PINCH START
          if (e.touches.length === 2) {
            const dx = e.touches[0].pageX - e.touches[1].pageX;
            const dy = e.touches[0].pageY - e.touches[1].pageY;
            this.lastTouchDist = Math.sqrt(dx * dx + dy * dy);
            return;
          }

          const touch = e.changedTouches[0];
          this.isDragging = false;
          this.lastMouse = { x: touch.clientX, y: touch.clientY };
          this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
          this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
      }, { passive: false });

      this.renderer.domElement.addEventListener("touchmove", e => {
          if(e.target === this.renderer.domElement) e.preventDefault();
          
          // PINCH MOVE (ZOOM)
          if (e.touches.length === 2) {
            const dx = e.touches[0].pageX - e.touches[1].pageX;
            const dy = e.touches[0].pageY - e.touches[1].pageY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate change in distance
            const delta = dist - this.lastTouchDist;
            
            // Adjust Zoom (Sensitivity: 0.005)
            this.targetZoom = clamp(this.targetZoom + delta * 0.005, 0.5, 3.0);
            
            this.lastTouchDist = dist;
            return; 
          }

          this.isDragging = true;
      }, { passive: false });

      this.renderer.domElement.addEventListener("touchend", e => {
          if(e.target === this.renderer.domElement) e.preventDefault();
          
          // Ignore pinch lift-off
          if (e.touches.length > 0) return;

          if (!this.isDragging) {
              const touch = e.changedTouches[0];
              this.onClick({
                  clientX: touch.clientX,
                  clientY: touch.clientY,
                  button: 0 
              });
          }
      }, { passive: false });

      // Wheel Zoom (PC)
      window.addEventListener("wheel", e => {
        if (e.ctrlKey) e.preventDefault();
        e.preventDefault();
        this.targetZoom = clamp(this.targetZoom - e.deltaY * 0.002, 0.55, 3.0);
      }, { passive: false });

      window.addEventListener("resize", () => this.onResize());
      window.addEventListener("contextmenu", e => e.preventDefault());

      this.ui.skipBtn.onclick = () => this.skipDay();
      this.ui.advisorBtn.onclick = () => this.getTacticalAdvice();

      this.ui.summonBtn.onclick = () => {
        this.showBanner("DEMO MODE", "Survive 5 nights → Mutant Boss → THE END");
      };

      document.querySelectorAll(".build-btn").forEach(btn => {
        const m = btn.dataset.mode;
        if (!m) return;
        btn.addEventListener("click", () => this.setMode(m));
        btn.addEventListener("touchend", (e) => {
             e.preventDefault(); 
             this.setMode(m);
        });
      });

      this.ui.btnHow.onclick = () => this.ui.howModal.style.display = "flex";
      this.ui.btnCloseHow.onclick = () => this.ui.howModal.style.display = "none";

      this.ui.btnStart.onclick = () => {
        this.ui.startScreen.style.display = "none";
        this.active = true;

        const el = document.documentElement;
        if(el.requestFullscreen) el.requestFullscreen().catch(()=>{});
        else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();

        this.showStory([
          "…Where am I?",
          "The air is cold. Too quiet.",
          "There’s a Core nearby… like it’s waiting for me.",
          "I don’t remember building any of this.",
          "But I do remember one thing:",
          "If I don’t survive the nights… I won’t get answers."
        ], "PROLOGUE");
      };

      this.createHighDetailGround();
      this.buildWorldOnce();
      this.spawnHighPolyMC();
      this.updateUI();
      this.animate();
    },

    // ===================== STORY / BANNERS =====================
    ensureStoryOverlay() {
      if (this.story.overlay) return;

      const wrap = document.createElement("div");
      wrap.style.position = "fixed";
      wrap.style.inset = "0";
      wrap.style.display = "none";
      wrap.style.alignItems = "center";
      wrap.style.justifyContent = "center";
      wrap.style.background = "rgba(0,0,0,0.75)";
      wrap.style.backdropFilter = "blur(6px)";
      wrap.style.zIndex = "9999";
      wrap.style.fontFamily = "Poppins, system-ui, sans-serif";

      const card = document.createElement("div");
      card.style.width = "min(760px, 92vw)";
      card.style.border = "1px solid rgba(255,255,255,0.18)";
      card.style.borderRadius = "18px";
      card.style.padding = "20px 22px";
      card.style.background = "rgba(12,12,16,0.75)";
      card.style.boxShadow = "0 20px 70px rgba(0,0,0,0.55)";

      const title = document.createElement("div");
      title.id = "story-title";
      title.style.letterSpacing = "0.12em";
      title.style.fontSize = "12px";
      title.style.opacity = "0.75";
      title.style.marginBottom = "10px";

      const text = document.createElement("div");
      text.id = "story-text";
      text.style.fontSize = "20px";
      text.style.lineHeight = "1.45";
      text.style.color = "white";
      text.style.margin = "12px 0 14px";

      const hint = document.createElement("div");
      hint.id = "story-hint";
      hint.style.opacity = "0.7";
      hint.style.fontSize = "13px";

      card.appendChild(title);
      card.appendChild(text);
      card.appendChild(hint);
      wrap.appendChild(card);
      document.body.appendChild(wrap);

      wrap.addEventListener("click", () => this.advanceStory());
      this.story.overlay = wrap;
    },

    showStory(lines, title = "BLESSED IDIOT: SURVIVAL DEMO") {
      this.ensureStoryOverlay();
      this.story.lines = lines.slice();
      this.story.step = 0;
      this.story.active = true;

      document.getElementById("story-title").innerText = title;
      document.getElementById("story-text").innerText = this.story.lines[0] ?? "";
      document.getElementById("story-hint").innerText = "Click to continue…";
      this.story.overlay.style.display = "flex";
    },

    advanceStory() {
      if (!this.story.active) return;
      this.story.step++;

      if (this.story.step >= this.story.lines.length) {
        this.story.active = false;
        this.story.overlay.style.display = "none";
        return;
      }

      document.getElementById("story-text").innerText = this.story.lines[this.story.step];
      document.getElementById("story-hint").innerText =
        (this.story.step >= this.story.lines.length - 1) ? "Click to begin…" : "Click to continue…";
    },

    showBanner(title, subtitle = "") {
      const b = document.createElement("div");
      b.style.position = "fixed";
      b.style.left = "50%";
      b.style.top = "14%";
      b.style.transform = "translate(-50%, -8px)";
      b.style.padding = "12px 16px";
      b.style.borderRadius = "14px";
      b.style.background = "rgba(0,0,0,0.65)";
      b.style.border = "1px solid rgba(255,255,255,0.15)";
      b.style.color = "white";
      b.style.fontFamily = "Poppins, system-ui, sans-serif";
      b.style.zIndex = "9998";
      b.style.textAlign = "center";
      b.style.opacity = "0";
      b.style.transition = "opacity 220ms ease, transform 220ms ease";

      b.innerHTML = `
        <div style="font-weight:700; letter-spacing:0.06em">${title}</div>
        ${subtitle ? `<div style="opacity:0.75; font-size:13px; margin-top:4px">${subtitle}</div>` : ""}
      `;
      document.body.appendChild(b);

      requestAnimationFrame(() => {
        b.style.opacity = "1";
        b.style.transform = "translate(-50%, 0px)";
      });

      setTimeout(() => {
        b.style.opacity = "0";
        b.style.transform = "translate(-50%, -8px)";
        setTimeout(() => b.remove(), 260);
      }, 1800);
    },

    endDemoOutro() {
      this.showStory([
        "…It’s not stopping.",
        "Every night, they come back stronger.",
        "And now… they’re mutating.",
        "How long will I still survive?",
        "",
        "THE END"
      ], "OUTRO");
      this.active = false;
    },

    // ===================== WORLD BUILD =====================
    buildWorldOnce() {
      if (this.worldBuilt) return;
      this.worldBuilt = true;

      for (let x = -this.WORLD_SIZE / 2; x < this.WORLD_SIZE / 2; x++) {
        for (let z = -this.WORLD_SIZE / 2; z < this.WORLD_SIZE / 2; z++) {
          const k = keyOf(x, z);
          this.grid[k] = { x, z, walkable: true, type: "ground", building: null, prop: null };
        }
      }

      this.generateWaterPuddles();
      this.scatterInitialResources();

      // Auto place core near center if player hasn't placed it
      if (!this.coreTile) {
        this.createBuilding(0, 0, "core");
      }
    },

    generateWaterPuddles() {
      const maxPuddles = randInt(2, 4);
      const made = [];

      for (let i = 0; i < maxPuddles; i++) {
        let cx = randInt(-this.WORLD_SIZE / 2 + 6, this.WORLD_SIZE / 2 - 6);
        let cz = randInt(-this.WORLD_SIZE / 2 + 6, this.WORLD_SIZE / 2 - 6);

        if (Math.abs(cx) < 3 && Math.abs(cz) < 3) { i--; continue; }

        const radius = randInt(3, 6);
        const blobby = 0.55 + Math.random() * 0.25;

        for (let x = cx - radius; x <= cx + radius; x++) {
          for (let z = cz - radius; z <= cz + radius; z++) {
            const dx = x - cx;
            const dz = z - cz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > radius) continue;
            if (Math.random() < blobby - (dist / (radius + 0.001)) * 0.45) {
              const k = keyOf(x, z);
              const tile = this.grid[k];
              if (!tile || tile.building || tile.prop) continue;
              if (tile.type === "water") continue;
              this.createWater(x, z);
              made.push(k);
            }
          }
        }
      }

      made.forEach(k => this.waterTiles.add(k));
    },

    scatterInitialResources() {
      const treeCount = randInt(55, 75);
      const rockCount = randInt(40, 55);
      const crystalCount = randInt(2, 4);

      let placedTrees = 0;
      while (placedTrees < treeCount) {
        const x = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        const z = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
        const k = keyOf(x, z);
        const t = this.grid[k];
        if (!t || t.type === "water" || t.prop || t.building) continue;
        this.createProp(x, z, "tree");
        placedTrees++;
      }

      let placedRocks = 0;
      while (placedRocks < rockCount) {
        const x = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        const z = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
        const k = keyOf(x, z);
        const t = this.grid[k];
        if (!t || t.type === "water" || t.prop || t.building) continue;
        this.createProp(x, z, "rock");
        placedRocks++;
      }

      let placedCrystals = 0;
      while (placedCrystals < crystalCount) {
        const x = randInt(-this.WORLD_SIZE / 2 + 6, this.WORLD_SIZE / 2 - 6);
        const z = randInt(-this.WORLD_SIZE / 2 + 6, this.WORLD_SIZE / 2 - 6);
        const k = keyOf(x, z);
        const t = this.grid[k];
        if (!t || t.type === "water" || t.prop || t.building) continue;
        this.createProp(x, z, "crystal");
        this.crystalTiles.add(k);
        placedCrystals++;
      }

      const animalCount = randInt(5, 8);
      let placedAnimals = 0;
      while (placedAnimals < animalCount) {
        const x = randInt(-this.WORLD_SIZE / 2 + 4, this.WORLD_SIZE / 2 - 4);
        const z = randInt(-this.WORLD_SIZE / 2 + 4, this.WORLD_SIZE / 2 - 4);
        const k = keyOf(x, z);
        const t = this.grid[k];
        if (!t || t.type === "water" || t.prop || t.building) continue;
        this.spawnAnimal(x, z);
        placedAnimals++;
      }
    },

    refreshDayResources() {
      const addTrees = randInt(6, 10);
      const addRocks = randInt(4, 7);
      const addAnimals = Math.random() < 0.5 ? 1 : 0;

      let t = 0;
      while (t < addTrees) {
        const x = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        const z = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
        const k = keyOf(x, z);
        const tile = this.grid[k];
        if (!tile || tile.type === "water" || tile.prop || tile.building) continue;
        this.createProp(x, z, "tree");
        t++;
      }

      let r = 0;
      while (r < addRocks) {
        const x = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        const z = randInt(-this.WORLD_SIZE / 2 + 1, this.WORLD_SIZE / 2 - 1);
        if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
        const k = keyOf(x, z);
        const tile = this.grid[k];
        if (!tile || tile.type === "water" || tile.prop || tile.building) continue;
        this.createProp(x, z, "rock");
        r++;
      }

      if (addAnimals) {
        let tries = 0;
        while (tries < 60) {
          const x = randInt(-this.WORLD_SIZE / 2 + 4, this.WORLD_SIZE / 2 - 4);
          const z = randInt(-this.WORLD_SIZE / 2 + 4, this.WORLD_SIZE / 2 - 4);
          const k = keyOf(x, z);
          const tile = this.grid[k];
          if (tile && tile.type !== "water" && !tile.prop && !tile.building) {
            this.spawnAnimal(x, z);
            break;
          }
          tries++;
        }
      }

      if (this.crystalTiles.size < 6 && Math.random() < 0.18) {
        let tries = 0;
        while (tries < 120) {
          const x = randInt(-this.WORLD_SIZE / 2 + 6, this.WORLD_SIZE / 2 - 6);
          const z = randInt(-this.WORLD_SIZE / 2 + 6, this.WORLD_SIZE / 2 - 6);
          const k = keyOf(x, z);
          const tile = this.grid[k];
          if (tile && tile.type !== "water" && !tile.prop && !tile.building) {
            this.createProp(x, z, "crystal");
            this.crystalTiles.add(k);
            break;
          }
          tries++;
        }
      }
    },

    // ===================== GEMINI (optional) =====================
    async callGemini(prompt) {
      if (this.geminiBusy) return null;
      if (!apiKey) {
          this.showText(window.innerWidth / 2, window.innerHeight / 2, "NO API KEY", "#ff0000");
          return null;
      }
      this.geminiBusy = true;
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        this.geminiBusy = false;
        return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      } catch {
        this.geminiBusy = false;
        this.showText(window.innerWidth / 2, window.innerHeight / 2, "AI FAIL", "#ff0000");
        return null;
      }
    },

    async getTacticalAdvice() {
      this.showText(window.innerWidth / 2, window.innerHeight / 2, "ASKING ADVISOR...", "#00b894");
      const prompt = `Survival advisor. Day ${this.dayCount}. Wood ${this.resources.wood}, Stone ${this.resources.stone}, Crystal ${this.resources.crystal}. Give 1 short actionable tip.`;
      const advice = await this.callGemini(prompt);
      if (advice) this.showText(window.innerWidth / 2, 200, advice, "#ffffff");
    },

    // ===================== PLAYER MODEL =====================
    spawnHighPolyMC() {
      const group = new THREE.Group();
      const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.35 });
      const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.85 });
      const pantMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.95 });

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.2), shirtMat);
      torso.position.y = 0.55;
      group.add(torso);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), skinMat);
      head.position.y = 0.9;
      group.add(head);

      const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), shirtMat);
      lArm.position.set(-0.25, 0.55, 0);
      group.add(lArm);

      const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), shirtMat);
      rArm.position.set(0.25, 0.55, 0);
      group.add(rArm);

      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), pantMat);
      lLeg.position.set(-0.1, 0.2, 0);
      group.add(lLeg);

      const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), pantMat);
      rLeg.position.set(0.1, 0.2, 0);
      group.add(rLeg);

      const pickGroup = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6), new THREE.MeshStandardMaterial({ color: 0x5D4037 }));
      const headPick = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x95a5a6, metalness: 0.8, roughness: 0.25 }));
      pickGroup.add(handle);
      headPick.position.y = 0.25;
      pickGroup.add(headPick);
      pickGroup.position.set(0.25, 0.3, 0.2);
      pickGroup.rotation.x = Math.PI / 2;
      group.add(pickGroup);

      group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(group);

      this.mc.mesh = group;
      this.mc.legs = [lLeg, rLeg];
      this.mc.pickaxe = pickGroup;
    },

    // ===================== GROUND =====================
    createHighDetailGround() {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#2d5a27";
      ctx.fillRect(0, 0, 512, 512);

      for (let i = 0; i < 5200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#3a7a30" : "#1e3c1b";
        const x = Math.random() * 512, y = Math.random() * 512, s = Math.random() * 4 + 1;
        ctx.fillRect(x, y, s, s);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 10);

      const geo = new THREE.PlaneGeometry(90, 90, 72, 72);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const nx = pos.getX(i) * 0.18;
        const ny = pos.getY(i) * 0.18;
        pos.setZ(i, Math.sin(nx) * Math.cos(ny) * 0.45 - 0.55);
      }
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    },

    createWater(x, z) {
      const tile = this.grid[keyOf(x, z)];
      if (!tile || tile.type === "water" || tile.building || tile.prop) return;

      const hole = new THREE.Mesh(
        new THREE.BoxGeometry(1.02, 0.5, 1.02),
        new THREE.MeshStandardMaterial({ color: 0x071118, roughness: 0.95 })
      );
      hole.position.set(x, -0.70, z);
      hole.receiveShadow = true;
      this.scene.add(hole);

      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(1.02, 1.02, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x2ea8ff, transparent: true, opacity: 0.62, roughness: 0.15 })
      );
      surface.rotation.x = -Math.PI / 2;
      surface.position.set(x, -0.52, z);
      surface.receiveShadow = true;
      this.scene.add(surface);

      tile.type = "water";
      tile.walkable = false;
      tile.waterMesh = { hole, surface };
    },

    // ===================== PROPS / ANIMALS =====================
    spawnAnimal(x, z) {
      const type = Math.random();
      let mesh, hp, speed, name, scale;

      if (type < 0.33) {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.6), new THREE.MeshStandardMaterial({ color: 0x7f8c8d }));
        body.position.y = 0.25;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0x95a5a6 }));
        head.position.set(0, 0.45, 0.3);
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.15), new THREE.MeshStandardMaterial({ color: 0xbdc3c7 }));
        snout.position.set(0, 0.4, 0.5);
        mesh.add(body, head, snout);
        hp = 15; speed = 0.9; name = "Wolf"; scale = 0.85;
      } else if (type < 0.66) {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
        body.position.y = 0.35;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: 0x4e342e }));
        head.position.set(0, 0.6, 0.4);
        mesh.add(body, head);
        hp = 50; speed = 0.4; name = "Bear"; scale = 1.15;
      } else {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.6), new THREE.MeshStandardMaterial({ color: 0x8D6E63 }));
        body.position.y = 0.35;
        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.15), new THREE.MeshStandardMaterial({ color: 0x8D6E63 }));
        neck.position.set(0, 0.55, 0.35);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x6D4C41 }));
        head.position.set(0, 0.75, 0.4);
        mesh.add(body, neck, head);
        hp = 20; speed = 1.1; name = "Deer"; scale = 1.0;
      }

      mesh.position.set(x, 0, z);
      mesh.scale.setScalar(scale);
      mesh.traverse(o => o.castShadow = true);
      this.scene.add(mesh);

      this.entities.push({
        mesh, hp,
        type: "animal",
        subType: name,
        speed,
        nextMove: 0,
        cooldown: 0,
        team: "neutral"
      });
    },

    createProp(x, z, type) {
      const tile = this.grid[keyOf(x, z)];
      if (!tile || tile.building || tile.type === "water" || tile.prop) return;

      let mesh, hp, yieldAmt = 0;

      if (type === "tree") {
        mesh = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 1.0 }));
        trunk.position.y = 0.45;
        const l1 = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.85 }));
        l1.position.y = 1.08;
        const l2 = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.65, 8), new THREE.MeshStandardMaterial({ color: 0x388E3C, roughness: 0.85 }));
        l2.position.y = 1.45;
        mesh.add(trunk, l1, l2);
        mesh.traverse(o => o.castShadow = true);
        hp = 6;
        yieldAmt = randInt(55, 95);
      } else if (type === "crystal") {
        mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32, 0),
          new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00bcd4, emissiveIntensity: 0.65, metalness: 0.9, roughness: 0.12 })
        );
        mesh.position.y = 0.52;
        mesh.castShadow = true;
        hp = 55;
        yieldAmt = randInt(3, 6);
      } else {
        mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 0.78 }));
        mesh.position.y = 0.28;
        mesh.scale.set(1, 0.7, 1);
        mesh.castShadow = true;
        hp = 6;
        yieldAmt = randInt(45, 80);
      }

      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      tile.prop = { type, mesh, hp, yield: yieldAmt };
    },

    // ===================== BUILDINGS =====================
    createBuilding(x, z, type) {
      const tile = this.grid[keyOf(x, z)];
      if (!tile || tile.type === "water" || tile.building) return;

      if (tile.prop) {
        if (tile.prop.type === "crystal") this.crystalTiles.delete(keyOf(x, z));
        this.scene.remove(tile.prop.mesh);
        tile.prop = null;
      }

      let mesh, hp = 100, walkable = false, workers = 0, maxWorkers = 0;

      if (type === "core") {
        mesh = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85 }));
        b.position.y = 0.25;
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x00d2ff, emissiveIntensity: 0.55 }));
        crystal.position.y = 0.8;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 32), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.85 }));
        ring.position.y = 0.5;
        ring.rotation.x = Math.PI / 2;
        mesh.add(b, crystal, ring);
        hp = 1500;
        this.buildingCounts.core = 1;
      } else if (type === "plantation") {
        mesh = new THREE.Group();
        const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.95 }));
        const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.75 }));
        sprout.position.y = 0.2;
        mesh.add(bed, sprout);
        hp = 50;
      } else if (type === "lumber" || type === "quarry") {
        mesh = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: type === "lumber" ? 0x8D6E63 : 0x546E7A, roughness: 0.9 }));
        b.position.y = 0.4;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 }));
        roof.position.y = 0.9;
        roof.rotation.y = Math.PI / 4;
        mesh.add(b, roof);
        hp = 200;
        maxWorkers = 2;
        this.buildingCounts[type]++;
      } else if (type === "blacksmith") {
        mesh = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.88 }));
        b.position.y = 0.25;
        const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.4 }));
        anvil.position.set(0, 0.6, 0);
        mesh.add(b, anvil);
        hp = 420;
        this.buildingCounts.blacksmith++;
      } else if (type === "barracks") {
        mesh = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.95 }));
        b.position.y = 0.3;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 0.85 }));
        roof.position.y = 0.9;
        roof.rotation.y = Math.PI / 4;
        mesh.add(b, roof);
        hp = 520;
        this.buildingCounts.barracks++;
      } else if (type === "factory") {
        mesh = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.95), new THREE.MeshStandardMaterial({ color: 0x1f2a33, roughness: 0.8 }));
        b.position.y = 0.325;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.55, 6), new THREE.MeshStandardMaterial({ color: 0x00d2ff, emissive: 0x00bcd4, emissiveIntensity: 0.35, roughness: 0.35 }));
        top.position.y = 0.85;
        mesh.add(b, top);
        hp = 860;
        this.buildingCounts.factory++;
      } else if (["archer", "cannon", "wall", "spikes"].includes(type)) {
        if (type === "archer") { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.85 })); mesh.position.y = 0.9; hp = 320; }
        if (type === "cannon") { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.1), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.65, metalness: 0.25 })); mesh.position.y = 0.35; hp = 540; }
        if (type === "wall") { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.45, 0.95), new THREE.MeshStandardMaterial({ color: 0x3f3f3f, roughness: 0.95 })); mesh.position.y = 0.725; hp = 680; }
        if (type === "spikes") { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.95), new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.7, metalness: 0.15 })); mesh.position.y = 0.1; hp = 130; walkable = true; }
      } else if (type === "campfire") {
        mesh = new THREE.Group();
        const logs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.95 }));
        const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0xff9f43, emissive: 0xff7b00, emissiveIntensity: 0.55, roughness: 0.4 }));
        fire.position.y = 0.22;
        const light = new THREE.PointLight(0xff9f43, 1.2, 12);
        light.position.y = 0.6;
        mesh.add(logs, fire, light);
        hp = 60;
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 }));
        mesh.position.y = 0.4;
        hp = 100;
      }

      mesh.position.set(x, 0, z);
      mesh.traverse(o => o.castShadow = true);
      this.scene.add(mesh);

      tile.building = {
        type, mesh, hp,
        nextGather: 0,
        nextShot: 0,
        workers: this.safeNumber(workers, 0),
        maxWorkers: this.safeNumber(maxWorkers, 0),
        level: 1,
        growProgress: 0,
        readyShown: false
      };

      tile.walkable = walkable;

      if (type === "core") this.coreTile = tile;
      if (type === "campfire") this.campfireTiles.add(keyOf(x, z));
    },

    // ===================== WORKERS =====================
    spawnWorkerForBuilding(tile) {
      const b = tile?.building;
      if (!b) return;
      if (!(b.type === "lumber" || b.type === "quarry")) return;

      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.35, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.9 })
      );
      body.position.y = 0.35;

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.4 })
      );
      head.position.y = 0.6;

      const tool = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.35, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.6, metalness: 0.2 })
      );
      tool.position.set(0.18, 0.42, 0);
      tool.rotation.z = 0.35;

      g.add(body, head, tool);
      g.position.set(tile.x + (Math.random() - 0.5) * 0.6, 0, tile.z + (Math.random() - 0.5) * 0.6);
      g.traverse(o => o.castShadow = true);
      this.scene.add(g);

      const id = this.nextWorkerId++;
      this.workers.push({
        id,
        mesh: g,
        buildingKey: keyOf(tile.x, tile.z),
        job: b.type,
        state: "idle",
        targetTileKey: null,
        carry: 0,
        mineCooldown: 0
      });
    },

    findNearestPropGlobal(fromX, fromZ, propType) {
      let bestTile = null;
      let bestD = Infinity;
      for (const k in this.grid) {
        const t = this.grid[k];
        if (!t?.prop || t.prop.type !== propType) continue;
        if ((t.prop.yield ?? 0) <= 0 || (t.prop.hp ?? 0) <= 0) continue;
        const d = Math.abs(t.x - fromX) + Math.abs(t.z - fromZ);
        if (d < bestD) { bestD = d; bestTile = t; }
      }
      return bestTile;
    },

    updateWorkers(dt) {
      if (!this.USE_WORKERS) return;

      for (const w of this.workers) {
        const home = this.grid[w.buildingKey];
        if (!home?.building) {
          if (w.mesh) this.scene.remove(w.mesh);
          w.dead = true;
          continue;
        }

        const b = home.building;
        const level = this.safeNumber(b.level, 1);

        const carryMax = 12 + level * 6;
        const mineDelay = 0.55 / (1 + level * 0.12);

        const propType = (w.job === "lumber") ? "tree" : "rock";
        const homePos = b.mesh.position;

        if (this.isNight) {
          w.state = "returning";
          w.targetTileKey = null;
        }

        if (!this.isNight && !w.targetTileKey) {
          const targetTile = this.findNearestPropGlobal(home.x, home.z, propType);
          w.targetTileKey = targetTile ? keyOf(targetTile.x, targetTile.z) : null;
          w.state = w.targetTileKey ? "toNode" : "idle";
        }

        let targetPos = null;

        if (w.state === "toNode" || w.state === "mining") {
          const tt = w.targetTileKey ? this.grid[w.targetTileKey] : null;
          const prop = tt?.prop;

          if (!tt || !prop || (prop.yield ?? 0) <= 0 || (prop.hp ?? 0) <= 0) {
            w.targetTileKey = null;
            w.state = "idle";
            continue;
          }

          targetPos = prop.mesh.position.clone();
        }

        if (w.state === "returning") {
          targetPos = homePos.clone();
        }

        if (!targetPos) continue;

        const dist = w.mesh.position.distanceTo(targetPos);

        if (dist > 0.9 && w.state !== "mining") {
          const steer = this.steerMove(w.mesh.position, targetPos);
          if (steer.length() > 0) {
            const spd = 1.6;
            w.mesh.position.add(steer.multiplyScalar(spd * dt));
            const dx = targetPos.x - w.mesh.position.x;
            const dz = targetPos.z - w.mesh.position.z;
            w.mesh.rotation.y = Math.atan2(dx, dz);
          }
          continue;
        }

        if (w.state === "toNode") w.state = "mining";

        if (w.state === "mining" && !this.isNight) {
          w.mineCooldown -= dt;
          if (w.mineCooldown <= 0) {
            w.mineCooldown = mineDelay;

            const tt = this.grid[w.targetTileKey];
            const prop = tt?.prop;
            if (!prop) { w.targetTileKey = null; w.state = "idle"; continue; }

            const mined = (propType === "tree")
              ? (2 + Math.floor(level * 0.7))
              : (1 + Math.floor(level * 0.6));

            prop.hp -= 2;
            prop.yield = Math.max(0, (prop.yield ?? 0) - mined);
            w.carry += mined;

            if (Math.random() < 0.08) {
              this.spawnParticles(prop.mesh.position.x, 0.4, prop.mesh.position.z, propType === "tree" ? 0x2ecc71 : 0x95a5a6, 2);
            }

            if ((prop.yield ?? 0) <= 0 || (prop.hp ?? 0) <= 0) {
              this.scene.remove(prop.mesh);
              tt.prop = null;
              w.targetTileKey = null;
              w.state = "idle";
            }

            if (w.carry >= carryMax) {
              w.state = "returning";
              w.targetTileKey = null;
            }
          }
        }

        if (w.state === "returning" && dist <= 1.1) {
          if (w.carry > 0) {
            if (w.job === "lumber") this.resources.wood += w.carry;
            else this.resources.stone += w.carry;

            w.carry = 0;
            this.updateUI();
          }

          if (!this.isNight) w.state = "idle";
        }
      }

      this.workers = this.workers.filter(w => !w.dead);
    },

    // ===================== UI / INSPECTOR =====================
    selectBuilding(tile) {
      this.selectedBuilding = tile;
      if (!tile || !tile.building) return this.closeInspector();

      const b = tile.building;
      this.ui.inspector.style.display = "flex";
      this.ui.menuContainer.style.opacity = "0";
      this.ui.inspTitle.innerText = `${b.type.toUpperCase()} LVL ${b.level}`;
      this.ui.inspStats.innerText = `HP: ${Math.floor(b.hp)}`;

      let html = `<button class="insp-btn" onclick="window.game.closeInspector()">❌ CLOSE</button>`;

      if (b.type !== "core" && b.type !== "demolish") {
        const cW = b.level * 80;
        const cS = b.level * 40;
        html = `<button class="insp-btn build-action" onclick="window.game.upgradeStructure()">⬆️ UPGRADE<span>${cW}W ${cS}S</span></button>` + html;
      }

      if (b.type === "core") html = `<button class="insp-btn build-action" onclick="window.game.healCore()">⬆️ HEAL CORE<span>100W</span></button>` + html;

      if (b.type === "factory") {
        html =
          `<button class="insp-btn build-action" onclick="window.game.setMode('wall'); window.game.closeInspector()">🧱 WALL<span>20W</span></button>
           <button class="insp-btn build-action" onclick="window.game.setMode('spikes'); window.game.closeInspector()">🗡️ SPIKES<span>20S</span></button>
           <button class="insp-btn combat-action" onclick="window.game.setMode('place-archer'); window.game.closeInspector()">🏰 ARCHER<span>Kit Req</span></button>
           <button class="insp-btn combat-action" onclick="window.game.setMode('place-cannon'); window.game.closeInspector()">💥 CANNON<span>Kit Req</span></button>` + html;
      }

      if (b.type === "lumber" || b.type === "quarry") html = `<button class="insp-btn" onclick="window.game.hireWorker()">👷 HIRE (${b.workers}/${b.maxWorkers})<span>50W</span></button>` + html;

      if (b.type === "blacksmith") {
        html =
          `<button class="insp-btn craft-action" onclick="window.game.craftItem('archer')">🏹 ARCHER KIT<span>60W 20S</span></button>
           <button class="insp-btn craft-action" onclick="window.game.craftItem('cannon')">💣 CANNON KIT<span>100W 50S</span></button>` + html;
      }

      if (b.type === "barracks") html = `<button class="insp-btn combat-action" onclick="window.game.trainKnight()">⚔️ KNIGHT<span>80W 20S</span></button>` + html;

      if (b.type === "plantation") {
        if (b.growProgress >= 100) {
          html = `<button class="insp-btn craft-action" onclick="window.game.harvestFarm()">🍖 HARVEST<span>+${10 + Math.floor(b.level * 4)}</span></button>` + html;
        } else {
          html = `<button class="insp-btn">🌿 GROWING<span>${Math.floor(b.growProgress)}%</span></button>` + html;
        }
      }

      this.ui.inspBtns.innerHTML = html;
    },

    harvestFarm() {
      const b = this.selectedBuilding?.building;
      if (!b || b.type !== "plantation") return;
      if (b.growProgress < 100) return;
      const gain = 10 + Math.floor(b.level * 4);
      this.resources.food += gain;
      b.growProgress = 0;
      b.readyShown = false;
      this.showText(window.innerWidth / 2, 170, `+${gain} FOOD`, "#2ecc71");
      this.updateUI();
      this.selectBuilding(this.selectedBuilding);
    },

    upgradeStructure() {
      const b = this.selectedBuilding?.building;
      if (!b) return;

      const costW = b.level * 80;
      const costS = b.level * 40;

      if (this.resources.wood >= costW && this.resources.stone >= costS) {
        this.resources.wood -= costW;
        this.resources.stone -= costS;
        b.level++;
        b.hp += 70;
        if (b.type === "lumber" || b.type === "quarry") b.maxWorkers += 1;
        this.showText(window.innerWidth / 2, window.innerHeight / 2, "UPGRADED TO LVL " + b.level, "#f1c40f");
        this.updateUI();
        this.selectBuilding(this.selectedBuilding);
      } else {
        this.showText(window.innerWidth / 2, window.innerHeight / 2, `NEED ${costW}W ${costS}S`, "#ff0000");
      }
    },

    hireWorker() {
      const b = this.selectedBuilding?.building;
      if (!b) return;

      b.workers = this.safeNumber(b.workers, 0);
      b.maxWorkers = this.safeNumber(b.maxWorkers, 0);

      if (this.resources.wood >= 50 && b.workers < b.maxWorkers) {
        this.resources.wood -= 50;
        b.workers += 1;

        if (this.USE_WORKERS) this.spawnWorkerForBuilding(this.selectedBuilding);

        this.showText(window.innerWidth / 2, 140, `WORKER HIRED (${b.workers}/${b.maxWorkers})`, "#f1c40f");
        this.updateUI();
        this.selectBuilding(this.selectedBuilding);
      } else {
        this.showText(window.innerWidth / 2, 140, `CAN'T HIRE (${b.workers}/${b.maxWorkers})`, "#ff4757");
      }
    },

    healCore() {
      const b = this.selectedBuilding?.building;
      if (!b) return;
      if (this.resources.wood >= 100) {
        this.resources.wood -= 100;
        b.hp += 520;
        this.updateUI();
        this.selectBuilding(this.selectedBuilding);
      }
    },

    craftItem(type) {
      if (type === "archer" && this.resources.wood >= 60 && this.resources.stone >= 20) {
        this.resources.wood -= 60;
        this.resources.stone -= 20;
        this.resources.archerItems++;
        this.showText(window.innerWidth / 2, 120, "CRAFTED ARCHER KIT", "#00d2ff");
      } else if (type === "cannon" && this.resources.wood >= 100 && this.resources.stone >= 50) {
        this.resources.wood -= 100;
        this.resources.stone -= 50;
        this.resources.cannonItems++;
        this.showText(window.innerWidth / 2, 120, "CRAFTED CANNON KIT", "#ff7675");
      } else {
        this.showText(window.innerWidth / 2, 120, "NOT ENOUGH MATERIALS", "#ff4757");
      }
      this.updateUI();
    },

    trainKnight() {
      if (!this.selectedBuilding) return;
      if (this.resources.wood >= 80 && this.resources.stone >= 20) {
        this.resources.wood -= 80;
        this.resources.stone -= 20;
        this.spawnEntity({ color: 0x3498db, hp: 65, speed: 1.25, scale: 1 }, "knight", { x: this.selectedBuilding.x, z: this.selectedBuilding.z });
        this.updateUI();
        this.showText(window.innerWidth / 2, window.innerHeight / 2, "KNIGHT TRAINED", "#3498db");
      } else {
        this.showText(window.innerWidth / 2, window.innerHeight / 2, "NEED 80 WOOD 20 STONE", "#ff0000");
      }
    },

    // ===================== WAVE SYSTEM =====================
    getSpawnDelay(night) {
      const base = night === 1 ? 2.2 : night === 2 ? 1.6 : night === 3 ? 1.25 : night === 4 ? 1.05 : 0.9;
      return base + Math.random() * 0.45;
    },

    enemiesRemaining() {
      return this.entities.filter(e => e.team === "enemy").length;
    },

    getZombieTypeForNight(night, idx) {
      // Demo interpretation:
      // Night 1-2: normal only
      // Night 3: brute introduced
      // Night 4: ranged introduced
      // Night 5: mixed harder
      if (night <= 2) return "normal";
      if (night === 3) return (idx % 3 === 2) ? "brute" : "normal";
      if (night === 4) return (idx % 3 === 2) ? "ranged" : (idx % 7 === 6 ? "brute" : "normal");
      if (night === 5) return (idx % 4 === 3) ? "ranged" : (idx % 6 === 5 ? "brute" : "normal");
      return "normal";
    },

    getZombieStats(subType, night) {
      if (subType === "normal") {
        const hp = night === 1 ? 14 : (14 + (night - 1) * 4);
        return { color: 0xe74c3c, hp, speed: 1.85 + (night - 1) * 0.06, scale: 1.05, subType };
      }
      if (subType === "brute") {
        const hp = 60 + (night - 3) * 12;
        return { color: 0x2ecc71, hp, speed: 1.25, scale: 1.65, subType };
      }
      if (subType === "ranged") {
        const hp = 30 + (night - 4) * 8;
        return { color: 0x9b59b6, hp, speed: 1.55, scale: 1.15, subType };
      }
      if (subType === "mutant") {
        return { color: 0x0b0b0b, hp: 2200, speed: 0.95, scale: 3.2, subType };
      }
      return { color: 0xe74c3c, hp: 18, speed: 1.9, scale: 1.05, subType: "normal" };
    },

    getFarSpawnPoint() {
      const safeRadius = 16;
      const triesMax = 200;

      const corePos = this.coreTile?.building?.mesh?.position ?? new THREE.Vector3(0, 0, 0);
      const playerPos = this.mc.mesh?.position ?? new THREE.Vector3(0, 0, 0);

      const min = -Math.floor(this.WORLD_SIZE / 2) + 1;
      const max = Math.floor(this.WORLD_SIZE / 2) - 1;

      for (let i = 0; i < triesMax; i++) {
        const side = randInt(0, 3);
        let x, z;

        if (side === 0) { x = min; z = randInt(min, max); }
        if (side === 1) { x = max; z = randInt(min, max); }
        if (side === 2) { z = min; x = randInt(min, max); }
        if (side === 3) { z = max; x = randInt(min, max); }

        const t = this.grid[keyOf(x, z)];
        if (!t || t.type === "water" || (t.building && !t.walkable)) continue;

        const p = new THREE.Vector3(x, 0, z);
        if (p.distanceTo(corePos) < safeRadius) continue;
        if (p.distanceTo(playerPos) < safeRadius) continue;

        return { x, z };
      }

      return { x: randInt(-18, 18), z: randInt(-18, 18) };
    },

    startNightWave(night) {
      this.spawnIndexThisNight = 0;

      // Night 5 triggers boss phase AFTER wave is fully spawned and cleared
      if (night === this.MAX_NIGHTS) this.awaitingBoss = true;

      const base = randInt(this.N1_MIN, this.N1_MAX);
      const total = Math.floor(base * Math.pow(2, Math.max(0, night - 1)));

      this.spawnQueue = Math.min(total, 160);
      this.ui.waveInfo.innerText = `WAVE: ${this.spawnQueue}`;
      this.ui.waveInfo.style.display = "block";
      this.nextSpawnTime = (Date.now() / 1000) + this.getSpawnDelay(night);

      const extra =
        night === 3 ? "New zombie: BRUTE" :
        night === 4 ? "New zombie: RANGED" :
        night === 5 ? "Final Night. Survive." : "";

      this.showBanner(`NIGHT ${night}`, extra);
    },

    spawnMutantBoss() {
      if (this.bossSpawned || this.bossDefeated) return;
      this.bossSpawned = true;

      const pos = this.getFarSpawnPoint();
      const stats = this.getZombieStats("mutant", 5);

      this.showBanner("⚠ MUTANT HAS APPEARED ⚠", "Kill it to finish the demo.");
      this.spawnEntity(stats, "mutant", pos);
    },

    // ===================== COMBAT / PROJECTILES =====================
    fireProjectile(start, target, type, damage = null) {
      const col = type === "arrow" ? 0xffffff : type === "acid" ? 0x9b59b6 : 0x111111;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshBasicMaterial({ color: col }));
      p.position.copy(start);
      this.scene.add(p);

      const dmg =
        damage ?? (type === "arrow" ? 12 : type === "bomb" ? 34 : type === "acid" ? 10 : 8);

      const speed = type === "acid" ? 8 : 10;

      this.projectiles.push({ mesh: p, target, type, speed, damage: dmg });
    },

    // ===================== MINING =====================
    mineProp(prop) {
      if (!prop) return;
      prop.hp -= 6;

      if (this.mc.pickaxe) {
        this.mc.pickaxe.rotation.x = 0;
        setTimeout(() => { if (this.mc.pickaxe) this.mc.pickaxe.rotation.x = Math.PI / 2; }, 90);
      }

      if (prop.type === "tree") {
        const gained = 12;
        this.resources.wood += gained;
        prop.yield = Math.max(0, (prop.yield ?? 0) - gained);
        this.showText(window.innerWidth / 2, 200, `+${gained} Wood`, "#ffffff");
        this.spawnParticles(prop.mesh.position.x, 0.5, prop.mesh.position.z, 0x2ecc71, 5);
      } else if (prop.type === "crystal") {
        this.resources.crystal += 1;
        prop.yield = Math.max(0, (prop.yield ?? 0) - 1);
        this.showText(window.innerWidth / 2, 200, "+1 CRYSTAL", "#00d2ff");
        this.spawnParticles(prop.mesh.position.x, 0.55, prop.mesh.position.z, 0x00d2ff, 5);
      } else {
        const gained = 4;
        this.resources.stone += gained;
        prop.yield = Math.max(0, (prop.yield ?? 0) - gained);
        this.showText(window.innerWidth / 2, 200, `+${gained} Stone`, "#ffffff");
        this.spawnParticles(prop.mesh.position.x, 0.45, prop.mesh.position.z, 0x95a5a6, 5);
      }

      if ((prop.yield ?? 1) <= 0 || prop.hp <= 0) {
        this.scene.remove(prop.mesh);
        for (const k in this.grid) {
          const t = this.grid[k];
          if (t.prop === prop) {
            if (t.prop.type === "crystal") this.crystalTiles.delete(keyOf(t.x, t.z));
            t.prop = null;
            break;
          }
        }
      }

      this.updateUI();
    },

    // ===================== MOVEMENT / PATHING =====================
    isBlocked(x, z) {
      const t = this.grid[keyOf(Math.round(x), Math.round(z))];
      if (!t) return true;
      if (t.type === "water") return true;
      if (t.building && !t.walkable) return true;
      return false;
    },

    steerMove(from, to) {
      const dir = new THREE.Vector3().subVectors(to, from);
      dir.y = 0;
      if (dir.length() < 0.001) return new THREE.Vector3(0, 0, 0);
      dir.normalize();

      const ahead = from.clone().add(dir.clone().multiplyScalar(0.65));
      if (!this.isBlocked(ahead.x, ahead.z)) return dir;

      const left = new THREE.Vector3(dir.z, 0, -dir.x);
      const right = new THREE.Vector3(-dir.z, 0, dir.x);

      const try1 = from.clone().add(left.clone().multiplyScalar(0.65));
      if (!this.isBlocked(try1.x, try1.z)) return left.normalize();

      const try2 = from.clone().add(right.clone().multiplyScalar(0.65));
      if (!this.isBlocked(try2.x, try2.z)) return right.normalize();

      // tiny jitter fallback to unstick sometimes
      const j = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      const try3 = from.clone().add(j);
      if (!this.isBlocked(try3.x, try3.z)) return j.normalize();

      return new THREE.Vector3(0, 0, 0);
    },

    // ===================== INPUT =====================
    getHover(e) {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const t = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(plane, t);
      return t ? { x: Math.round(t.x), z: Math.round(t.z) } : null;
    },

    onPointerDown(e) {
      this.isDragging = false;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    },

    onPointerMove(e) {
      if (e.buttons === 1) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.isDragging = true;
      }
      this.lastMouse = { x: e.clientX, y: e.clientY };
      const t = this.getHover(e);
      if (t) this.cursor.position.set(t.x, 0.05, t.z);
    },

    onPointerUp(e) {
      if (!this.isDragging) this.onClick(e);
    },

    onClick(e) {
      const t = this.getHover(e);
      if (!t) return;

      const tile = this.grid[keyOf(t.x, t.z)];
      if (!tile) return;

      const isMove = (e.button === 2) || (this.mode === "gather" && !tile.building && !tile.prop && tile.type !== "water");
      if (isMove) {
        this.mc.targetPos = new THREE.Vector3(t.x, 0, t.z);
        this.spawnParticles(t.x, 0.1, t.z, 0x3498db, 5);
        this.mc.miningTarget = null;
        return;
      }

      if (tile.building) {
        this.selectBuilding(tile);
        return;
      }

      if (tile.prop && this.mode === "gather") {
        this.mc.miningTarget = tile.prop;
        const dest = new THREE.Vector3(t.x, 0, t.z);
        if (this.mc.mesh && this.mc.mesh.position.distanceTo(dest) < 4) {
          this.mineProp(tile.prop);
          this.mc.miningTarget = null;
        } else {
          this.mc.targetPos = new THREE.Vector3(t.x, 0, t.z);
        }
        return;
      }

      if (this.mode !== "gather" && !tile.building && tile.type !== "water") {
        let costW = 0, costS = 0, costC = 0;

        if (this.mode === "campfire" || this.mode === "wall") costW = 20;
        else if (this.mode === "plantation") costW = 40;
        else if (this.mode === "lumber" || this.mode === "quarry") costW = 75;
        else if (this.mode === "blacksmith") { costW = 120; costS = 40; }
        else if (this.mode === "barracks") { costW = 150; costS = 50; }
        else if (this.mode === "factory") { costW = 160; costC = 5; }
        else if (this.mode === "spikes") costS = 20;

        if (this.mode === "place-archer" && this.resources.archerItems > 0) {
          this.resources.archerItems--;
          this.createBuilding(t.x, t.z, "archer");
          this.updateUI();
          return;
        }

        if (this.mode === "place-cannon" && this.resources.cannonItems > 0) {
          this.resources.cannonItems--;
          this.createBuilding(t.x, t.z, "cannon");
          this.updateUI();
          return;
        }

        if (this.mode === "demolish") return;

        if (this.resources.wood >= costW && this.resources.stone >= costS && this.resources.crystal >= costC) {
          this.resources.wood -= costW;
          this.resources.stone -= costS;
          this.resources.crystal -= costC;
          this.createBuilding(t.x, t.z, this.mode);
          this.setMode("gather");
        } else {
          this.showText(e.clientX, e.clientY, "NO RESOURCES", "#ff0000");
        }
      }

      this.updateUI();
    },

    // ===================== ENTITIES =====================
    spawnEntity(stats, type, pos) {
      const x = pos ? pos.x : (Math.random() - 0.5) * 30;
      const z = pos ? pos.z : (Math.random() - 0.5) * 30;

      let mesh;

      // ZOMBIES
      if (["normal", "brute", "ranged", "mutant"].includes(type)) {
        mesh = new THREE.Group();

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.6, 0.25),
          new THREE.MeshStandardMaterial({ color: stats.color, roughness: 0.85 })
        );
        body.position.y = 0.6;

        const headCol = (type === "mutant") ? 0x111111 : (type === "ranged" ? 0x4a235a : 0x2e7d32);
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.25, 0.25),
          new THREE.MeshStandardMaterial({ color: headCol, roughness: 0.85 })
        );
        head.position.y = 1.0;

        const lArm = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.35, 0.1),
          new THREE.MeshStandardMaterial({ color: stats.color, roughness: 0.85 })
        );
        lArm.position.set(-0.3, 0.6, 0.15);
        lArm.rotation.x = -Math.PI / 2;

        const rArm = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.35, 0.1),
          new THREE.MeshStandardMaterial({ color: stats.color, roughness: 0.85 })
        );
        rArm.position.set(0.3, 0.6, 0.15);
        rArm.rotation.x = -Math.PI / 2;

        mesh.add(body, head, lArm, rArm);

        if (type === "ranged") {
          const sac = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 12, 12),
            new THREE.MeshStandardMaterial({ color: 0x9b59b6, emissive: 0x6c3483, emissiveIntensity: 0.45 })
          );
          sac.position.set(0, 0.85, -0.18);
          mesh.add(sac);
        }

        if (type === "mutant") {
          const hump = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.55, 0.45),
            new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9 })
          );
          hump.position.set(0, 0.9, -0.05);
          mesh.add(hump);
        }

        mesh.scale.setScalar(stats.scale || 1);
      }
      // KNIGHT
      else if (type === "knight") {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0xbdc3c7, roughness: 0.6, metalness: 0.2 }));
        body.position.y = 0.7;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.65, metalness: 0.25 }));
        head.position.y = 1.2;
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.45, metalness: 0.35 }));
        sword.position.set(0.4, 0.8, 0.3);
        sword.rotation.x = Math.PI / 4;
        mesh.add(body, head, sword);
      }
      // fallback
      else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({ color: stats.color, roughness: 0.85 }));
      }

      mesh.position.set(x, 0, z);
      mesh.traverse(o => o.castShadow = true);
      this.scene.add(mesh);

      const isPlayer = (type === "knight");
      const isEnemy = !isPlayer;

      this.entities.push({
        mesh,
        hp: stats.hp,
        maxHp: stats.hp,
        type,
        subType: type,
        speed: stats.speed,
        nextMove: 0,
        cooldown: 0,
        rangedCooldown: 0,
        abilityCooldown: 0,
        team: isPlayer ? "player" : (isEnemy ? "enemy" : "neutral"),
        boss: (type === "mutant"),
        ranged: (type === "ranged"),
        animSeed: Math.random() * 10
      });
    },

    // ===================== FX / TEXT =====================
    showText(x, y, msg, col) {
      const div = document.createElement("div");
      div.className = "floating-text";
      div.innerText = msg;
      div.style.left = x + "px";
      div.style.top = y + "px";
      div.style.color = col;
      document.getElementById("fx-container").appendChild(div);
      setTimeout(() => div.remove(), 1000);
    },

    spawnParticles(x, y, z, col, count) {
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: col }));
        m.position.set(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4);
        this.scene.add(m);
        this.particles.push(m);
        setTimeout(() => this.scene.remove(m), 520);
      }
    },

    closeInspector() {
      this.selectedBuilding = null;
      this.ui.inspector.style.display = "none";
      this.ui.menuContainer.style.opacity = "1";
      this.setMode("gather");
    },

    setMode(m) {
      this.mode = m;
      document.querySelectorAll(".build-btn").forEach(b => b.classList.remove("active"));
      const btn = document.getElementById("btn-" + m);
      if (btn) btn.classList.add("active");
      if (this.selectedBuilding) this.closeInspector();
    },

    updateUI() {
      this.ui.wood.innerText = this.resources.wood;
      this.ui.stone.innerText = this.resources.stone;
      this.ui.food.innerText = this.resources.food;
      this.ui.crystal.innerText = this.resources.crystal;
      this.ui.invArcher.innerText = this.resources.archerItems;
      this.ui.invCannon.innerText = this.resources.cannonItems;
    },

    onResize() {
      const asp = window.innerWidth / window.innerHeight;
      this.camera.left = -14 * asp;
      this.camera.right = 14 * asp;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    },

    skipDay() {
      if (!this.isNight) this.cycleTimer = 0.5;
    },

    gameOver() {
      this.active = false;
      document.getElementById("game-over").style.display = "flex";
    },

    // ===================== MAIN LOOP =====================
    animate() {
      requestAnimationFrame(() => this.animate());

      // still render when paused
      if (!this.active) {
        this.renderer.render(this.scene, this.camera);
        return;
      }

      // pause gameplay during story overlay
      if (this.story.active) {
        this.renderer.render(this.scene, this.camera);
        return;
      }

      const dt = 0.016;
      const time = Date.now() / 1000;

      // Day/night timer
      this.cycleTimer -= dt;

      const prog = this.isNight
        ? 1 - (this.cycleTimer / this.NIGHT_DURATION)
        : 1 - (this.cycleTimer / this.DAY_DURATION);

      const t = this.isNight ? 0.9 : 0.0;
      const daySky = new THREE.Color(0x87CEEB);
      const nightSky = new THREE.Color(0x050510);
      const skyCol = daySky.clone().lerp(nightSky, t);
      this.scene.background.lerp(skyCol, 0.03);
      this.scene.fog.color.lerp(skyCol, 0.03);

      const sunAngle = (this.isNight ? Math.PI : 0) + prog * Math.PI;
      const sunR = 36;
      this.sun.position.set(Math.cos(sunAngle) * sunR, 22 + Math.sin(sunAngle) * 10, Math.sin(sunAngle) * sunR);
      this.mainLight.position.set(this.sun.position.x, this.sun.position.y + 10, this.sun.position.z);
      this.mainLight.intensity = this.isNight ? 0.22 : 1.25;

      // Transitions
      if (this.cycleTimer <= 0) {
        this.isNight = !this.isNight;
        this.cycleTimer = this.isNight ? this.NIGHT_DURATION : this.DAY_DURATION;

        if (this.isNight) {
          // Start a wave
          this.startNightWave(this.dayCount);
        } else {
          // Day begins
          this.dayCount++;
          this.refreshDayResources();
          this.ui.waveInfo.style.display = "none";
        }

        this.ui.label.innerText = this.isNight ? `NIGHT ${this.dayCount}` : `DAY ${this.dayCount}`;
        this.ui.label.style.color = this.isNight ? "#ff6b81" : "#f1c40f";
      }

      // Spawn enemies (night-only spawn, but they can remain into day)
      if (this.isNight && this.spawnQueue > 0 && time > this.nextSpawnTime) {
        const night = this.dayCount;
        const subType = this.getZombieTypeForNight(night, this.spawnIndexThisNight);
        const stats = this.getZombieStats(subType, night);
        const pos = this.getFarSpawnPoint();

        this.spawnEntity(stats, subType, pos);

        this.spawnQueue--;
        this.spawnIndexThisNight++;
        this.ui.waveInfo.innerText = `WAVE: ${this.spawnQueue}`;
        this.nextSpawnTime = time + this.getSpawnDelay(night);
      }

      // Boss condition: after night 5 wave fully spawned AND all enemies cleared
      if (this.awaitingBoss && !this.bossSpawned && !this.bossDefeated) {
        if (this.spawnQueue <= 0 && this.enemiesRemaining() === 0) {
          this.spawnMutantBoss();
        }
      }

      // Survival stats
      this.mc.hunger -= dt * 0.04;
      this.mc.thirst -= dt * 0.06;

      if (this.mc.hunger <= 0) this.mc.hp -= dt * 1.2;
      if (this.mc.thirst <= 0) this.mc.hp -= dt * 1.4;

      // Campfire heal
      if (this.mc.mesh) {
        this.mc.mesh.position.y = 0;
        for (const k of this.campfireTiles) {
          const tt = this.grid[k];
          if (!tt || !tt.building) continue;
          if (this.mc.mesh.position.distanceTo(tt.building.mesh.position) < 3) {
            if (this.mc.hp < this.mc.maxHp) this.mc.hp += dt * 2.2;
            break;
          }
        }
      }

      // Water drink
      if (this.mc.mesh) {
        const px = Math.round(this.mc.mesh.position.x);
        const pz = Math.round(this.mc.mesh.position.z);
        const waterNearby =
          this.waterTiles.has(keyOf(px, pz)) ||
          this.waterTiles.has(keyOf(px + 1, pz)) ||
          this.waterTiles.has(keyOf(px - 1, pz)) ||
          this.waterTiles.has(keyOf(px, pz + 1)) ||
          this.waterTiles.has(keyOf(px, pz - 1));

        if (waterNearby) {
          const old = this.mc.thirst;
          this.mc.thirst = clamp(this.mc.thirst + dt * 8.5, 0, 100);
          if (Math.floor(old) !== Math.floor(this.mc.thirst) && Math.random() < 0.03) {
            this.showText(window.innerWidth / 2, 160, "DRINKING...", "#3498db");
          }
        }
      }

      // Player death check
      if (this.mc.hp <= 0) this.gameOver();

      // Core death check
      if (this.coreTile?.building && this.coreTile.building.hp <= 0) {
        this.showBanner("CORE DESTROYED", "Game Over.");
        this.gameOver();
      }

      // Update UI bars
      this.ui.hpFill.style.width = Math.max(0, this.mc.hp) + "%";
      this.ui.hungerFill.style.width = Math.max(0, this.mc.hunger) + "%";
      this.ui.thirstFill.style.width = Math.max(0, this.mc.thirst) + "%";

      // Camera follow
      if (this.mc.mesh) {
        const targetCam = new THREE.Vector3(this.mc.mesh.position.x + 15, 15, this.mc.mesh.position.z + 15);
        this.camera.position.lerp(targetCam, 0.1);
        this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, this.targetZoom, 0.1);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(this.mc.mesh.position);

        // Movement
        if (this.mc.targetPos) {
          const steer = this.steerMove(this.mc.mesh.position, this.mc.targetPos);
          if (steer.length() > 0 && this.mc.mesh.position.distanceTo(this.mc.targetPos) > 0.1) {
            this.mc.mesh.position.add(steer.multiplyScalar(this.mc.speed * dt));

            const dx = this.mc.targetPos.x - this.mc.mesh.position.x;
            const dz = this.mc.targetPos.z - this.mc.mesh.position.z;
            this.mc.mesh.rotation.y = Math.atan2(dx, dz);

            this.mc.legs[0].rotation.x = Math.sin(time * 15) * 0.5;
            this.mc.legs[1].rotation.x = Math.sin(time * 15 + Math.PI) * 0.5;

            if (this.mc.miningTarget && this.mc.mesh.position.distanceTo(this.mc.miningTarget.mesh.position) < 4) {
              this.mineProp(this.mc.miningTarget);
              this.mc.targetPos = null;
              this.mc.miningTarget = null;
            }
          } else {
            this.mc.targetPos = null;
          }
        } else {
          this.mc.legs[0].rotation.x = 0;
          this.mc.legs[1].rotation.x = 0;
        }
      }

      // Workers
      this.updateWorkers(dt);

      // Buildings logic
      for (const k in this.grid) {
        const tl = this.grid[k];
        const b = tl.building;
        if (!b) continue;

        if (b.type === "plantation") {
          const rate = 2 + b.level * 0.6;
          b.growProgress = Math.min(100, b.growProgress + dt * rate);
          if (b.mesh.children[1]) b.mesh.children[1].scale.setScalar(0.1 + (b.growProgress / 100) * 0.9);
          if (b.growProgress >= 100 && !b.readyShown) {
            b.readyShown = true;
            this.showText(window.innerWidth / 2, 170, "FARM READY", "#2ecc71");
          }
        }

        if (["archer", "cannon"].includes(b.type) && time > b.nextShot) {
          const range = 10;
          const target = this.entities.find(e => e.team === "enemy" && e.mesh.position.distanceTo(b.mesh.position) < range);
          if (target) {
            this.fireProjectile(b.mesh.position.clone(), target, b.type === "archer" ? "arrow" : "bomb");
            const baseCooldown = b.type === "archer" ? 0.55 : 1.95;
            const cooldown = baseCooldown / (1 + b.level * 0.15);
            b.nextShot = time + cooldown;
          }
        }
      }

      // Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        if (!p.target) {
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }

        const targetPos = p.target === this.mc
          ? this.mc.mesh?.position
          : p.target.mesh?.position;

        if (!targetPos) {
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }

        const dir = new THREE.Vector3().subVectors(targetPos, p.mesh.position).normalize();
        p.mesh.position.add(dir.multiplyScalar(p.speed * dt));

        if (p.mesh.position.distanceTo(targetPos) < 0.55) {
          if (p.target === this.mc) {
            this.mc.hp -= (p.damage ?? 8);
          } else {
            p.target.hp -= (p.damage ?? 8);
          }

          this.spawnParticles(p.mesh.position.x, 0.5, p.mesh.position.z, 0xffaa00, 4);
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
        }
      }

      // Entities
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];

        // death
        if (e.hp <= 0) {
          const px = e.mesh.position.x;
          const pz = e.mesh.position.z;

          if (e.type === "mutant") {
            this.bossDefeated = true;
            this.showBanner("MUTANT DOWN", "…but they keep mutating.");
            setTimeout(() => this.endDemoOutro(), 900);
          }

          this.scene.remove(e.mesh);
          this.entities.splice(i, 1);
          this.spawnParticles(px, 0.5, pz, 0xff0000, 10);
          continue;
        }

        // animals wander
        if (e.type === "animal") {
          if (time > e.nextMove) {
            const angle = Math.random() * Math.PI * 2;
            e.mesh.rotation.y = angle;
            e.nextMove = time + 2 + Math.random() * 3;
          }
          continue;
        }

        // target selection
        let targetPos = this.coreTile?.building?.mesh?.position ?? this.mc.mesh?.position;
        let targetKind = "core";

        if (this.mc.mesh && this.mc.mesh.position.distanceTo(e.mesh.position) < 8) {
          targetPos = this.mc.mesh.position;
          targetKind = "player";
        }

        // player units target enemies
        if (e.team === "player") {
          const enemy = this.entities.find(z => z.team === "enemy" && z.mesh.position.distanceTo(e.mesh.position) < 15);
          if (enemy) {
            targetPos = enemy.mesh.position;
            targetKind = "enemy";
          }
        }

        if (!targetPos) continue;

        // ===== ranged shooting =====
        if (e.team === "enemy" && e.ranged) {
          e.rangedCooldown -= dt;
          const shootRange = 10;

          if (this.mc.mesh && this.mc.mesh.position.distanceTo(e.mesh.position) < shootRange && e.rangedCooldown <= 0) {
            e.rangedCooldown = 1.35;
            this.fireProjectile(e.mesh.position.clone(), this.mc, "acid", 10);
            this.spawnParticles(e.mesh.position.x, 0.8, e.mesh.position.z, 0x9b59b6, 2);
          }
        }

        // ===== mutant stomp =====
        if (e.team === "enemy" && e.boss) {
          e.abilityCooldown = (e.abilityCooldown ?? 0) - dt;
          const rage = (e.hp <= (e.maxHp * 0.5));
          if (rage) e.speed = Math.max(e.speed, 1.25);

          const stompRange = 3.3;
          const stompCD = rage ? 1.25 : 1.85;

          if (this.mc.mesh && this.mc.mesh.position.distanceTo(e.mesh.position) < stompRange && e.abilityCooldown <= 0) {
            e.abilityCooldown = stompCD;
            const dmg = rage ? 26 : 18;
            this.mc.hp -= dmg;
            this.spawnParticles(e.mesh.position.x, 0.6, e.mesh.position.z, 0xffffff, 12);
            this.showBanner("MUTANT STOMP", rage ? "It’s enraged!" : "Run!");
          }
        }

        // movement / attack
        const dist = e.mesh.position.distanceTo(targetPos);

        // simple animation
        const moving = dist > 1.6;
        const wobble = Math.sin((time + e.animSeed) * (moving ? 12 : 5)) * (moving ? 0.12 : 0.04);
        e.mesh.position.y = wobble;

        // move
        if (dist > 1.6) {
          const steer = this.steerMove(e.mesh.position, targetPos);
          if (steer.length() > 0) {
            e.mesh.position.add(steer.multiplyScalar(e.speed * dt));
            const dx = targetPos.x - e.mesh.position.x;
            const dz = targetPos.z - e.mesh.position.z;
            e.mesh.rotation.y = Math.atan2(dx, dz);
          }
        } else {
          // attack
          if (e.cooldown <= 0) {
            if (e.team === "enemy") {
              if (targetKind === "player") {
                const dmg = e.boss ? 12 : e.subType === "brute" ? 10 : 5;
                this.mc.hp -= dmg;
              } else if (targetKind === "core" && this.coreTile?.building) {
                const dmg = e.boss ? 20 : e.subType === "brute" ? 12 : 6;
                this.coreTile.building.hp -= dmg;
                this.spawnParticles(this.coreTile.building.mesh.position.x, 0.5, this.coreTile.building.mesh.position.z, 0xffffff, 4);
              }
            }

            if (e.team === "player") {
              const enemy = this.entities.find(z => z.team === "enemy" && z.mesh.position.distanceTo(e.mesh.position) < 2.0);
              if (enemy) {
                enemy.hp -= 22;
                this.spawnParticles(enemy.mesh.position.x, 0.5, enemy.mesh.position.z, 0xffffff, 3);
              }
            }

            e.cooldown = 1.0;
          }
        }

        if (e.cooldown > 0) e.cooldown -= dt;
      }

      // Timer UI
      const mm = Math.max(0, Math.floor(this.cycleTimer / 60));
      const ss = Math.max(0, Math.floor(this.cycleTimer % 60)).toString().padStart(2, "0");
      this.ui.timer.innerText = `${mm.toString().padStart(2, "0")}:${ss}`;

      this.renderer.render(this.scene, this.camera);
    }
  };

  window.game = game;
  game.init();
})();