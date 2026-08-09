
/* Premium micro-interactions */
(function(){
  function ensureFx(){
    var layer = document.querySelector('.fx-layer');
    if(!layer){
      layer = document.createElement('div');
      layer.className = 'fx-layer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  window.PremiumFX = {
    burst: function(x, y, color){
      try {
        var layer = ensureFx();
        var colors = color ? [color] : ['#12e07a', '#00d4ff', '#ffb703', '#ff4d6d', '#a78bfa'];
        for(var i=0;i<14;i++){
          var p = document.createElement('div');
          p.className = 'fx-particle';
          var ang = (Math.PI * 2 * i) / 14;
          var dist = 40 + Math.random() * 50;
          p.style.left = x + 'px';
          p.style.top = y + 'px';
          p.style.background = colors[i % colors.length];
          p.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
          p.style.setProperty('--dy', (Math.sin(ang) * dist) + 'px');
          layer.appendChild(p);
          setTimeout(function(el){ try{ el.remove(); }catch(e){} }, 950, p);
        }
      } catch(e){}
    },
    coinPop: function(){
      var el = document.getElementById('coinCount');
      if(!el) return;
      var pill = el.closest('.stat-pill');
      if(!pill) return;
      pill.classList.remove('coin-pop');
      void pill.offsetWidth;
      pill.classList.add('coin-pop');
    }
  };

  // Hook correct answers if possible
  document.addEventListener('click', function(e){
    var t = e.target.closest('.opt-btn.correct');
    if(t){
      var r = t.getBoundingClientRect();
      PremiumFX.burst(r.left + r.width/2, r.top + r.height/2, '#12e07a');
      PremiumFX.coinPop();
    }
  }, true);
})();



/* Settings 3D hub wiring */
(function(){
  function wireSettings3D(){
    var grid = document.getElementById('settings3dGrid');
    if(!grid || grid._wired) return;
    grid._wired = true;
    grid.querySelectorAll('.s3d-card').forEach(function(btn){
      btn.addEventListener('click', function(){
        var go = btn.getAttribute('data-go');
        var act = btn.getAttribute('data-action');
        if(go && typeof switchScreen === 'function'){
          try { switchScreen(go); } catch(e){}
          try { closeSideMenu(); } catch(e){}
          return;
        }
        if(act === 'export'){
          var b = document.getElementById('exportBtn');
          if(b) b.click();
        } else if(act === 'import'){
          var i = document.getElementById('importBtn') || document.getElementById('importFile');
          if(i) i.click();
        } else if(act === 'share'){
          var s = document.getElementById('shareProfileBtn');
          if(s) s.click();
        } else if(act === 'theme'){
          var t = document.getElementById('themeSectionTitle') || document.getElementById('themeGrid');
          if(t) t.scrollIntoView({behavior:'smooth', block:'start'});
        }
      });
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(wireSettings3D, 100); });
  } else {
    setTimeout(wireSettings3D, 100);
  }
  // re-wire when opening profile
  var _sw = window.switchScreen;
  if(typeof _sw === 'function' && !_sw._s3d){
    window.switchScreen = function(id){
      var r = _sw.apply(this, arguments);
      if(id === 'screenProfile') setTimeout(wireSettings3D, 50);
      return r;
    };
    window.switchScreen._s3d = true;
  }
})();



/* Scroll helpers: side menu body lock */
(function(){
  var scrollY = 0;
  function lock(){
    scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('menu-open');
    document.body.style.top = '-' + scrollY + 'px';
  }
  function unlock(){
    document.body.classList.remove('menu-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollY || 0);
  }
  function isOpen(){
    var m = document.getElementById('sideMenu');
    return m && m.classList.contains('open');
  }
  // Hook common open/close if present
  var obs = new MutationObserver(function(){
    if(isOpen()) lock();
    else unlock();
  });
  function arm(){
    var m = document.getElementById('sideMenu');
    if(!m) return;
    obs.observe(m, { attributes: true, attributeFilter: ['class'] });
    // ensure nav can scroll
    var nav = m.querySelector('nav');
    if(nav){
      nav.style.overflowY = 'auto';
      nav.style.webkitOverflowScrolling = 'touch';
      nav.style.flex = '1 1 auto';
      nav.style.minHeight = '0';
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();

  // Safety: never leave body locked
  document.addEventListener('click', function(e){
    if(e.target && e.target.id === 'menuOverlay') setTimeout(function(){ if(!isOpen()) unlock(); }, 50);
  }, true);
})();
