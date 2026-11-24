/*
 * Aaradhya Setu · Puja product page behaviour
 * - package (variant) picker updates price, availability and the hidden variant id
 * - quantity stepper and optional add-ons update the live total
 * - validates devotee details, then adds the puja + selected add-ons to the cart
 *   in ONE /cart/add.js request (falls back to a normal form post without JS)
 * - image gallery thumbnails, sticky mobile Add to Cart bar
 * Runs inside Shopify, and in preview/index.html where `data-preview` mocks the cart.
 */
(function () {
  'use strict';

  function formatMoney(cents, format) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents, format);
    }
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
      cents / 100,
    );
  }

  function init(section) {
    if (section.dataset.aspReady) return;
    section.dataset.aspReady = 'true';

    const product = JSON.parse(section.querySelector('[data-asp-product]').textContent);
    const form = section.querySelector('[data-asp-form]');
    const variantInput = section.querySelector('[data-asp-variant-input]');
    const qtyInput = section.querySelector('[data-asp-qty-input]');
    const submitBtn = section.querySelector('[data-asp-submit]');
    const message = section.querySelector('[data-asp-message]');
    const priceEl = section.querySelector('[data-asp-price]');
    const compareEl = section.querySelector('[data-asp-compare]');
    const moneyFormat = section.dataset.moneyFormat;
    const isPreview = section.hasAttribute('data-preview');

    let variant = product.variants.find((v) => String(v.id) === String(variantInput.value)) || product.variants[0];

    // Puja date cannot be in the past.
    const dateInput = section.querySelector('[data-asp-date]');
    if (dateInput) {
      const today = new Date();
      today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
      dateInput.min = today.toISOString().slice(0, 10);
    }

    function selectedAddons() {
      return Array.from(section.querySelectorAll('[data-asp-addon]:checked')).map((el) => ({
        id: Number(el.dataset.variantId),
        price: Number(el.dataset.price),
        title: el.dataset.title,
      }));
    }

    function quantity() {
      const max = Number(qtyInput.max) || 10;
      const q = Math.min(Math.max(parseInt(qtyInput.value, 10) || 1, 1), max);
      qtyInput.value = q;
      return q;
    }

    function total() {
      return variant.price * quantity() + selectedAddons().reduce((sum, a) => sum + a.price, 0);
    }

    function render() {
      priceEl.textContent = formatMoney(variant.price, moneyFormat);
      if (compareEl) {
        const showCompare = variant.compare_at_price && variant.compare_at_price > variant.price;
        compareEl.hidden = !showCompare;
        if (showCompare) compareEl.textContent = formatMoney(variant.compare_at_price, moneyFormat);
      }
      const totalText = formatMoney(total(), moneyFormat);
      const label = section.querySelector('[data-asp-cta-label]');
      if (variant.available) {
        submitBtn.disabled = false;
        label.innerHTML = 'Add to Cart · <span data-asp-total></span>';
        label.querySelector('[data-asp-total]').textContent = totalText;
      } else {
        submitBtn.disabled = true;
        label.textContent = 'Sold out';
      }
      const sticky = section.querySelector('[data-asp-sticky-total]');
      if (sticky) sticky.textContent = totalText;
    }

    // Package / variant picker
    section.querySelectorAll('[data-asp-option]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const chosen = product.options.map((_, i) => {
          const checked = section.querySelector(`[data-asp-option="${i}"]:checked`);
          return checked ? checked.value : null;
        });
        const match = product.variants.find((v) => v.options.every((o, i) => o === chosen[i]));
        if (match) {
          variant = match;
          variantInput.value = match.id;
          if (!isPreview && window.history.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.set('variant', match.id);
            window.history.replaceState({}, '', url);
          }
          if (match.featured_image) swapImage(match.featured_image.src);
        }
        render();
      });
    });

    // Quantity
    section.querySelectorAll('[data-asp-qty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        qtyInput.value = (parseInt(qtyInput.value, 10) || 1) + Number(btn.dataset.aspQty);
        render();
      });
    });
    qtyInput.addEventListener('change', render);

    // Add-ons
    section.querySelectorAll('[data-asp-addon]').forEach((box) => box.addEventListener('change', render));

    // Gallery
    const mainImage = section.querySelector('[data-asp-main-image]');
    function swapImage(src) {
      if (!mainImage) return;
      mainImage.removeAttribute('srcset');
      mainImage.src = src;
    }
    section.querySelectorAll('[data-asp-thumb]').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        section.querySelectorAll('[data-asp-thumb]').forEach((t) => t.classList.remove('is-active'));
        thumb.classList.add('is-active');
        swapImage(thumb.dataset.aspThumb);
      });
    });

    function showMessage(text, kind) {
      message.textContent = text;
      message.dataset.kind = kind;
    }

    function validate() {
      let firstInvalid = null;
      section.querySelectorAll('[data-asp-required]').forEach((input) => {
        const valid = input.value.trim() !== '' && input.checkValidity();
        input.closest('.asp__field').classList.toggle('is-invalid', !valid);
        input.setAttribute('aria-invalid', String(!valid));
        if (!valid && !firstInvalid) firstInvalid = input;
      });
      if (firstInvalid) {
        firstInvalid.focus();
        showMessage('Please fill in the devotee details marked with *.', 'error');
        return false;
      }
      return true;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!validate()) return;

      const properties = {};
      new FormData(form).forEach((value, key) => {
        const m = key.match(/^properties\[(.+)\]$/);
        if (m && String(value).trim() !== '') properties[m[1]] = String(value).trim();
      });
      const items = [{ id: Number(variantInput.value), quantity: quantity(), properties }];
      selectedAddons().forEach((a) =>
        items.push({ id: a.id, quantity: 1, properties: { _For: properties['Devotee name'] || '' } }),
      );

      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');
      showMessage('', '');
      try {
        if (isPreview) {
          await new Promise((r) => setTimeout(r, 400));
          window.__aspLastCartRequest = { items };
        } else {
          const res = await fetch(section.dataset.cartAddUrl + '.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.description || err.message || 'Could not add to cart');
          }
          document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        }
        if (section.dataset.afterAdd === 'cart' && !isPreview) {
          window.location.href = section.dataset.cartUrl;
          return;
        }
        const extras = items.length > 1 ? ` with ${items.length - 1} offering${items.length > 2 ? 's' : ''}` : '';
        showMessage(`🙏 ${product.title}${extras} added to your cart.`, 'success');
      } catch (err) {
        showMessage(err.message, 'error');
      } finally {
        submitBtn.disabled = !variant.available;
        submitBtn.classList.remove('is-loading');
      }
    });

    // Sticky bar on mobile whenever the main Add to Cart button is off screen
    // (still below while reading the description, or scrolled past).
    const sticky = section.querySelector('[data-asp-sticky]');
    if (sticky && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        const show = !entry.isIntersecting;
        sticky.classList.toggle('is-visible', show);
        sticky.setAttribute('aria-hidden', String(!show));
      }).observe(submitBtn);
    }

    render();
  }

  function initAll() {
    document.querySelectorAll('[data-asp-section]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
  // Re-initialise when the section is added or changed in the theme editor.
  document.addEventListener('shopify:section:load', initAll);
})();
