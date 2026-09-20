/**
 * The full-screen artwork detail overlay: image, title, artist, year,
 * description, dimensions, license, and attribution link. Escape or the
 * close button dismiss it. Works even for a slot with no fetched data yet
 * (shows a "placeholder" explanation instead of an image).
 */
export class ArtworkOverlay {
  constructor() {
    this.root = document.getElementById('artwork-overlay');
    this.image = document.getElementById('artwork-overlay-image');
    this.placeholderNote = document.getElementById('artwork-overlay-placeholder');
    this.title = document.getElementById('artwork-overlay-title');
    this.meta = document.getElementById('artwork-overlay-meta');
    this.description = document.getElementById('artwork-overlay-description');
    this.dimensions = document.getElementById('artwork-overlay-dimensions');
    this.license = document.getElementById('artwork-overlay-license');
    this.sourceLink = document.getElementById('artwork-overlay-source');
    this.closeButton = document.getElementById('artwork-overlay-close');

    this.isOpen = false;
    this._onCloseCallbacks = [];

    this.closeButton.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  onClose(callback) {
    this._onCloseCallbacks.push(callback);
  }

  open(artwork) {
    this.isOpen = true;
    this.root.classList.remove('hidden');

    if (artwork) {
      this.image.src = `${import.meta.env.BASE_URL}${artwork.localImage}`;
      this.image.classList.remove('hidden');
      this.placeholderNote.classList.add('hidden');
      this.title.textContent = artwork.title;
      this.meta.textContent = `${artwork.artist} · ${artwork.year}`;
      this.description.textContent = artwork.description || 'No description available.';
      const dims = artwork.dimensions;
      this.dimensions.textContent = dims
        ? `${dims.widthCm} × ${dims.heightCm} cm${dims.source === 'fallback' ? ' (estimated)' : ''}`
        : '';
      this.license.textContent = artwork.license || 'License unknown';
      this.sourceLink.href = artwork.sourceUrl || '#';
      this.sourceLink.textContent = artwork.attribution || 'Source';
      this.sourceLink.classList.toggle('hidden', !artwork.sourceUrl);
    } else {
      this.image.classList.add('hidden');
      this.placeholderNote.classList.remove('hidden');
      this.title.textContent = 'Untitled placeholder';
      this.meta.textContent = '';
      this.description.textContent = 'No artwork data has been fetched for this slot yet. Run "npm run fetch:data" to pull real artworks from Finna.';
      this.dimensions.textContent = '';
      this.license.textContent = '';
      this.sourceLink.classList.add('hidden');
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    for (const cb of this._onCloseCallbacks) cb();
  }
}
