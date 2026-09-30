/* ==========================================================================
   鲁香居 · 交互脚本
   每个模块独立初始化,任意一块出错不影响其余部分。
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- 1. 页头状态 + 阅读进度 ------------------------------------------ */
  function initHeader() {
    var header = $('#siteHeader');
    var bar = $('#scrollBar');
    if (!header) return;

    var ticking = false;
    function update() {
      var y = window.scrollY || window.pageYOffset;
      header.classList.toggle('is-stuck', y > 24);

      if (bar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
        bar.style.width = (ratio * 100).toFixed(2) + '%';
      }

      var toTop = $('#toTop');
      if (toTop) toTop.classList.toggle('is-visible', y > 620);
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });

    update();
  }

  /* --- 2. 移动端导航抽屉 ------------------------------------------------ */
  function initNav() {
    var toggle = $('#navToggle');
    var nav = $('#primaryNav');
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) setOpen(false);
    });
  }

  /* --- 3. 滚动进场 ------------------------------------------------------ */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var callbacks = 0;
    var io = new IntersectionObserver(function (entries) {
      callbacks += 1;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Number(el.dataset.revealDelay || 0);
        window.setTimeout(function () { el.classList.add('is-visible'); }, delay);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    // 兜底:极少数环境下 IO 存在但不投递任何回调,3 秒后直接放行,避免内容永久隐形
    window.setTimeout(function () {
      if (callbacks === 0) items.forEach(function (el) { el.classList.add('is-visible'); });
    }, 3000);

    items.forEach(function (el, i) {
      // 同一栅格内轻微错开,避免整块一起跳出来
      if (!el.dataset.revealDelay && el.parentElement) {
        var siblings = $$('.reveal', el.parentElement);
        if (siblings.length > 1) el.dataset.revealDelay = String(siblings.indexOf(el) * 70);
      }
      io.observe(el);
    });
  }

  /* --- 4. 数字滚动 ------------------------------------------------------ */
  function initCounters() {
    var nums = $$('[data-count]');
    if (!nums.length) return;

    function run(el) {
      var target = Number(el.dataset.count) || 0;
      if (reduceMotion) { el.textContent = String(target); return; }

      var duration = 1400;
      var start = null;
      var done = false;

      function step(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) window.requestAnimationFrame(step);
        else { el.textContent = String(target); done = true; }
      }

      window.requestAnimationFrame(step);

      // 兜底:标签页被节流或 rAF 异常时,直接落到终值
      window.setTimeout(function () {
        if (!done) el.textContent = String(target);
      }, duration + 600);
    }

    if (!('IntersectionObserver' in window)) {
      nums.forEach(run);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    nums.forEach(function (el) { io.observe(el); });
  }

  /* --- 5. 菜单筛选 ------------------------------------------------------ */
  function initMenu() {
    var tabs = $$('.tab');
    var dishes = $$('.dish');
    if (!tabs.length || !dishes.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var filter = tab.dataset.filter;

        tabs.forEach(function (t) {
          var active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-pressed', String(active));
        });

        dishes.forEach(function (dish) {
          var show = filter === 'all' || dish.dataset.category === filter;
          dish.classList.toggle('is-hidden', !show);
        });
      });
    });
  }

  /* --- 5b. 菜品详情弹窗 ------------------------------------------------- */
  function initDishDialog() {
    var dialog = $('#dishDialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    var cards = $$('.dish');
    if (!cards.length) return;

    var els = {
      img: $('#dishDialogImg'),
      title: $('#dishDialogTitle'),
      price: $('#dishDialogPrice'),
      desc: $('#dishDialogDesc'),
      detail: $('#dishDialogDetail'),
      tag: $('#dishDialogTag'),
      count: $('#dishDialogCount'),
      book: $('#dishDialogBook'),
      close: $('#dishDialogClose'),
      prev: $('#dishDialogPrev'),
      next: $('#dishDialogNext')
    };

    var list = [];
    var index = 0;
    var lastFocus = null;

    function read(card) {
      var img = $('.dish__media img', card);
      var tag = $('.dish__tag', card);
      var name = $('.dish__head h3', card);
      var price = $('.dish__price', card);
      var desc = $('.dish__body p', card);
      var detail = $('.dish__detail', card);
      return {
        card: card,
        src: img ? img.getAttribute('src') : '',
        alt: img ? img.getAttribute('alt') : '',
        name: name ? name.textContent.trim() : '',
        price: price ? price.textContent.trim() : '',
        desc: desc ? desc.textContent.trim() : '',
        tag: tag ? tag.textContent.trim() : '',
        detail: detail ? detail.innerHTML : ''
      };
    }

    function visibleCards() {
      return cards.filter(function (c) { return !c.classList.contains('is-hidden'); });
    }

    function render() {
      var d = list[index];
      if (!d) return;

      if (els.img) {
        els.img.setAttribute('src', d.src);
        els.img.setAttribute('alt', d.alt);
      }
      if (els.title) els.title.textContent = d.name;
      if (els.price) els.price.textContent = d.price;
      if (els.desc) els.desc.textContent = d.desc;
      if (els.detail) els.detail.innerHTML = d.detail;
      if (els.tag) {
        els.tag.textContent = d.tag;
        els.tag.hidden = !d.tag;
      }
      if (els.count) els.count.textContent = (index + 1) + ' / ' + list.length;

      var single = list.length < 2;
      if (els.prev) els.prev.disabled = single;
      if (els.next) els.next.disabled = single;
    }

    function open(card) {
      var visible = visibleCards();
      list = visible.map(read);
      var pos = visible.indexOf(card);
      index = pos < 0 ? 0 : pos;
      lastFocus = $('.dish__hit', card) || document.activeElement;

      render();
      if (!dialog.open) dialog.showModal();
      document.body.classList.add('is-locked');
      if (els.close) els.close.focus();
    }

    /* 解锁与归还焦点都做成幂等,并且不依赖 close 事件——
       某些环境里 dialog.close() 不会派发 close,只靠事件会让页面卡在锁滚动状态。 */
    function unlock() {
      document.body.classList.remove('is-locked');
    }

    function restoreFocus() {
      var target = lastFocus;
      if (!target || typeof target.focus !== 'function') return;
      // 延后一拍,避开浏览器自身的焦点还原
      window.setTimeout(function () {
        if (document.contains(target)) target.focus();
      }, 30);
    }

    function closeDialog() {
      if (dialog.open) dialog.close();
      unlock();
      restoreFocus();
    }

    function step(delta) {
      if (list.length < 2) return;
      index = (index + delta + list.length) % list.length;
      render();
    }

    cards.forEach(function (card) {
      var hit = $('.dish__hit', card);
      if (hit) {
        hit.addEventListener('click', function () { open(card); });
      }
    });

    if (els.close) els.close.addEventListener('click', closeDialog);
    if (els.prev) els.prev.addEventListener('click', function () { step(-1); });
    if (els.next) els.next.addEventListener('click', function () { step(1); });

    // 点「订座时预留这道菜」:把菜名写进备注,再跳到订座表单
    if (els.book) {
      els.book.addEventListener('click', function () {
        var note = $('#bkNote');
        var name = list[index] ? list[index].name : '';
        if (note && name) {
          var value = note.value.trim();
          if (value.indexOf(name) === -1) {
            note.value = value ? value + ';想预留:' + name : '想预留:' + name;
          }
        }
        closeDialog();
      });
    }

    // 点遮罩关闭:面板之外的区域点击目标是 dialog 本身
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closeDialog();
    });

    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });

    // Esc 关闭走浏览器自身流程,这里兜底清理
    dialog.addEventListener('close', function () {
      unlock();
      restoreFocus();
    });
    dialog.addEventListener('cancel', unlock);
  }

  /* --- 6. 评价轮播 ------------------------------------------------------ */
  function initSlider() {
    var root = $('#slider');
    var track = $('#sliderTrack');
    if (!root || !track) return;

    var slides = $$('.quote', track);
    if (slides.length < 2) return;

    var dotsBox = $('#sliderDots');
    var index = 0;
    var timer = null;
    var dots = [];

    if (dotsBox) {
      slides.forEach(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', '查看第 ' + (i + 1) + ' 条评价');
        b.addEventListener('click', function () { go(i, true); });
        dotsBox.appendChild(b);
        dots.push(b);
      });
    }

    function render() {
      track.style.transform = 'translateX(' + (-index * 100) + '%)';
      dots.forEach(function (d, i) {
        d.classList.toggle('is-active', i === index);
        d.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
      slides.forEach(function (s, i) {
        s.setAttribute('aria-hidden', i === index ? 'false' : 'true');
      });
    }

    function go(i, stop) {
      index = (i + slides.length) % slides.length;
      render();
      if (stop) restart();
    }

    function restart() {
      if (timer) window.clearInterval(timer);
      if (reduceMotion) return;
      timer = window.setInterval(function () { go(index + 1); }, 6500);
    }

    var prev = $('#prevSlide');
    var next = $('#nextSlide');
    if (prev) prev.addEventListener('click', function () { go(index - 1, true); });
    if (next) next.addEventListener('click', function () { go(index + 1, true); });

    root.addEventListener('mouseenter', function () {
      if (timer) window.clearInterval(timer);
    });
    root.addEventListener('mouseleave', restart);
    root.addEventListener('focusin', function () {
      if (timer) window.clearInterval(timer);
    });
    root.addEventListener('focusout', restart);

    root.setAttribute('tabindex', '0');
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1, true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1, true); }
    });

    var startX = null;
    root.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 46) go(index + (dx < 0 ? 1 : -1), true);
      startX = null;
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) restart();
          else if (timer) window.clearInterval(timer);
        });
      }, { threshold: 0.35 }).observe(root);
    } else {
      restart();
    }

    render();
  }

  /* --- 7. 订座表单 ------------------------------------------------------ */
  function initBooking() {
    var form = $('#bookingForm');
    if (!form) return;

    var success = $('#bookingSuccess');

    function field(name) { return form.elements[name]; }

    function setError(name, msg) {
      var el = field(name);
      var slot = form.querySelector('[data-error-for="' + name + '"]');
      if (slot) slot.textContent = msg || '';
      if (!el) return;
      var wrap = el.closest('.field') || el.closest('.checkbox');
      if (wrap) wrap.classList.toggle('has-error', Boolean(msg));
    }

    var rules = {
      name: function (v) {
        if (!v.trim()) return '请填写您的称呼';
        if (v.trim().length < 2) return '称呼至少 2 个字';
        return '';
      },
      phone: function (v) {
        var s = v.replace(/[\s-]/g, '');
        if (!s) return '请填写手机号,方便回电确认';
        if (!/^1[3-9]\d{9}$/.test(s)) return '请输入 11 位有效手机号';
        return '';
      },
      date: function (v) {
        if (!v) return '请选择用餐日期';
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var picked = new Date(v + 'T00:00:00');
        if (picked < today) return '用餐日期不能早于今天';
        return '';
      },
      time: function (v) { return v ? '' : '请选择用餐时段'; },
      people: function (v) { return v ? '' : '请选择用餐人数'; },
      agree: function (_v, el) { return el.checked ? '' : '请先勾选同意,我们才好回电'; }
    };

    // 日期下限
    var dateInput = field('date');
    if (dateInput) {
      var now = new Date();
      var iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 10);
      dateInput.min = iso;
    }

    Object.keys(rules).forEach(function (name) {
      var el = field(name);
      if (!el) return;
      var evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'blur';
      el.addEventListener(evt, function () { setError(name, rules[name](el.value, el)); });
      el.addEventListener('input', function () {
        if ((el.closest('.field') || el.closest('.checkbox') || {}).classList) {
          var wrap = el.closest('.field') || el.closest('.checkbox');
          if (wrap && wrap.classList.contains('has-error')) {
            setError(name, rules[name](el.value, el));
          }
        }
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      var ok = true;

      Object.keys(rules).forEach(function (name) {
        var el = field(name);
        if (!el) return;
        var msg = rules[name](el.value, el);
        setError(name, msg);
        if (msg) {
          ok = false;
          if (!firstBad) firstBad = el;
        }
      });

      if (!ok) {
        if (firstBad) firstBad.focus();
        if (success) success.hidden = true;
        return;
      }

      var data = {
        name: field('name').value.trim(),
        phone: field('phone').value.replace(/[\s-]/g, ''),
        date: field('date').value,
        time: field('time').value,
        people: field('people').value,
        note: field('note') ? field('note').value.trim() : ''
      };

      // 演示环境:这里换成 fetch('/api/booking', { method:'POST', body: JSON.stringify(data) })
      void data;

      if (success) {
        success.textContent =
          data.name + '您好,已收到 ' + data.date + ' ' + data.time + ' · ' +
          data.people + ' 的订座申请。门店会在 30 分钟内致电 ' +
          data.phone.slice(0, 3) + '****' + data.phone.slice(-4) + ' 与您确认。';
        success.hidden = false;
      }

      form.reset();
      Object.keys(rules).forEach(function (name) { setError(name, ''); });
    });
  }

  /* --- 8. 回到顶部 + 年份 ------------------------------------------------ */
  function initMisc() {
    var toTop = $('#toTop');
    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }

    var year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function boot() {
    [
      initHeader,
      initNav,
      initReveal,
      initCounters,
      initMenu,
      initDishDialog,
      initSlider,
      initBooking,
      initMisc
    ].forEach(function (fn) {
      try { fn(); } catch (err) { /* 单块失败不影响整页 */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
