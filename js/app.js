const app = {
            products: [],
            cart: [],
            currentStep: 1,
            currentCategory: 'all',
            
            baseUrl: 'data/',
            
            jsonFiles: {
                all: 'all.json',
                smartwatch: 'smartwatches.json',
                automaticwatch: 'automaticwatches.json',
                menswatch: 'menswatches.json',
                womenswatch: 'womenswatches.json',
                powerbank: 'powerbanks.json',
                neckband: 'neckbands.json',
                earbuds: 'earbuds.json',
                headphone: 'headphones.json',
                speaker: 'speakers.json'
            },

            async init() {
                this.updateCartBadge();
                // Cloud is the ONLY source of truth now - no more old JSON products.
                // Whatever you add from Admin is what shows. Nothing else.
                this.listenToCloud();
            },

            allProducts: [], // full list from cloud (used by Admin panel)
            allCombos: [],
            categoryMap: { smartwatch: 'Smart Watch', automaticwatch: 'Automatic Watch', menswatch: "Men's Watch", womenswatch: "Women's Watch", powerbank: 'Powerbank', neckband: 'Neckband', headphone: 'Headphones', earbuds: 'Earbuds', speaker: 'Speakers' },

            listenToCloud() {
                if (typeof db === 'undefined') {
                    document.getElementById('products-grid').innerHTML = '<p class="col-span-full text-center text-gray-500 py-10">Cloud not connected.</p>';
                    return;
                }
                db.collection('products').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
                    const cloudProducts = [];
                    snapshot.forEach(doc => {
                        cloudProducts.push({ id: doc.id, ...doc.data() });
                    });
                    this.allProducts = cloudProducts;
                    this.applyFilter(this.currentCategory);
                    if (document.getElementById('admin-dashboard') && !document.getElementById('admin-dashboard').classList.contains('hidden')) {
                        this.renderAdminList();
                        this.renderAdminCombos();
                    }
                    this.populateHomeReviewProducts();
                    this.loadHomeReviews();
                }, (err) => console.error('Cloud listener error', err));

                // Combos real-time
                db.collection('combos').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
                    const combos = [];
                    snapshot.forEach(doc => combos.push({ id: doc.id, ...doc.data() }));
                    this.allCombos = combos;
                    this.renderCombos();
                    if (document.getElementById('admin-dashboard') && !document.getElementById('admin-dashboard').classList.contains('hidden')) {
                        this.renderAdminCombos();
                    }
                }, (err) => {
                    console.error('Combos listener error', err);
                    const grid = document.getElementById('combos-grid');
                    if (grid) grid.innerHTML = '<p class="col-span-full text-sm text-gray-400 text-center py-6">No combo offers yet.</p>';
                });
            },

            applyFilter(cat) {
                const grid = document.getElementById('products-grid');
                this.products = cat === 'all' ? this.allProducts : this.allProducts.filter(p => p.category === this.categoryMap[cat]);
                if (this.allProducts.length === 0) {
                    grid.innerHTML = '<p class="col-span-full text-center text-gray-500 py-10">No products yet. Add one from the Admin panel.</p>';
                } else {
                    this.renderProducts(cat);
                }
            },

            async fetchProducts(category) {
                const grid = document.getElementById('products-grid');
                grid.innerHTML = `
                    <div class="col-span-3 text-center py-16">
                        <div class="loader"></div>
                        <p class="text-gray-400 mt-4">Loading products...</p>
                    </div>`;

                try {
                    const fileName = this.jsonFiles[category] || this.jsonFiles.all;
                    const response = await fetch(this.baseUrl + fileName);
                    
                    if (!response.ok) throw new Error('Failed to load products');
                    
                    const data = await response.json();
                    this.products = data;
                    this.currentCategory = category;
                    this.renderProducts(category);
                } catch (error) {
                    console.error('Error loading products:', error);
                    grid.innerHTML = `
                        <div class="col-span-3 text-center py-16">
                            <div class="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i class="fas fa-exclamation-triangle text-3xl text-red-300"></i>
                            </div>
                            <p class="text-gray-500 mb-2">Failed to load products.</p>
                            <button onclick="app.fetchProducts('${category}')" class="text-blue-600 underline">Retry</button>
                        </div>`;
                }
            },

            formatPrice(price) {
                return '₹' + price.toLocaleString('en-IN');
            },

            // Star rating helpers (real reviews only – no fake numbers)
            renderStarsHtml(avg, count, sizeClass = 'text-sm') {
                const n = (count != null && count > 0) ? Number(count) : 0;
                if (n === 0) {
                    return `<span class="text-xs text-gray-400">No reviews yet</span>`;
                }
                const rating = Math.round(Number(avg) || 0);
                let stars = '';
                for (let i = 1; i <= 5; i++) {
                    stars += `<i class="fas fa-star ${i <= rating ? 'text-yellow-400' : 'text-gray-300'}"></i>`;
                }
                return `<div class="flex items-center gap-1 ${sizeClass}">${stars}<span class="text-gray-500 ml-1">(${n})</span></div>`;
            },

            currentReviewProductId: null,
            currentReviewRating: 0,

            setupStarPicker() {
                this.currentReviewRating = 0;
                document.querySelectorAll('.review-star').forEach(btn => {
                    btn.classList.remove('text-yellow-400');
                    btn.classList.add('text-gray-300');
                    btn.onclick = () => {
                        const val = parseInt(btn.dataset.star, 10);
                        this.currentReviewRating = val;
                        document.querySelectorAll('.review-star').forEach(b => {
                            const s = parseInt(b.dataset.star, 10);
                            if (s <= val) {
                                b.classList.remove('text-gray-300');
                                b.classList.add('text-yellow-400');
                            } else {
                                b.classList.remove('text-yellow-400');
                                b.classList.add('text-gray-300');
                            }
                        });
                        const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
                        document.getElementById('review-rating-label').textContent = labels[val] || '';
                    };
                });
                document.getElementById('review-rating-label').textContent = 'Tap stars';
                document.getElementById('review-name').value = '';
                document.getElementById('review-comment').value = '';
            },

            async loadProductReviews(productId) {
                const listEl = document.getElementById('modal-reviews-list');
                const starsEl = document.getElementById('modal-product-stars');
                const countEl = document.getElementById('modal-product-review-count');
                if (!productId || typeof db === 'undefined') {
                    listEl.innerHTML = '<p class="text-sm text-gray-400">No reviews yet. Be the first!</p>';
                    starsEl.innerHTML = '';
                    countEl.textContent = '';
                    return;
                }
                listEl.innerHTML = '<p class="text-sm text-gray-400">Loading reviews...</p>';
                try {
                    const snap = await db.collection('products').doc(productId)
                        .collection('reviews').orderBy('createdAt', 'desc').limit(20).get();
                    const reviews = [];
                    snap.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));

                    if (reviews.length === 0) {
                        listEl.innerHTML = '<p class="text-sm text-gray-400">No reviews yet. Be the first!</p>';
                        starsEl.innerHTML = this.renderStarsHtml(0, 0);
                        countEl.textContent = '';
                        return;
                    }

                    const avg = reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
                    starsEl.innerHTML = this.renderStarsHtml(avg, reviews.length, 'text-sm');
                    countEl.textContent = '';

                    listEl.innerHTML = reviews.map(r => {
                        const stars = this.renderStarsHtml(r.rating, 1, 'text-xs').replace(/\(\d+\)/, '');
                        const date = r.createdAt && r.createdAt.toDate
                            ? r.createdAt.toDate().toLocaleDateString('en-IN')
                            : '';
                        return `
                            <div class="bg-white border border-gray-100 rounded-lg p-3">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="font-medium text-sm text-gray-900">${(r.name || 'Customer').replace(/</g, '&lt;')}</span>
                                    <span class="text-xs text-gray-400">${date}</span>
                                </div>
                                <div class="mb-1">${stars}</div>
                                <p class="text-sm text-gray-600">${(r.comment || '').replace(/</g, '&lt;')}</p>
                            </div>`;
                    }).join('');
                } catch (err) {
                    console.error('Load reviews error', err);
                    listEl.innerHTML = '<p class="text-sm text-red-400">Could not load reviews.</p>';
                }
            },

            async submitReview() {
                const productId = this.currentReviewProductId;
                const name = (document.getElementById('review-name').value || '').trim();
                const comment = (document.getElementById('review-comment').value || '').trim();
                const rating = this.currentReviewRating;

                if (!productId) {
                    this.showToast('Product not found');
                    return;
                }
                if (!name) {
                    this.showToast('Please enter your name');
                    return;
                }
                if (!rating || rating < 1 || rating > 5) {
                    this.showToast('Please select a star rating');
                    return;
                }
                if (!comment) {
                    this.showToast('Please write a short review');
                    return;
                }

                const btn = document.getElementById('review-submit-btn');
                btn.disabled = true;
                btn.textContent = 'Submitting...';

                try {
                    await db.collection('products').doc(productId).collection('reviews').add({
                        name,
                        rating,
                        comment,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Update product avg + count for card display
                    const snap = await db.collection('products').doc(productId)
                        .collection('reviews').get();
                    let sum = 0, count = 0;
                    snap.forEach(d => { sum += d.data().rating || 0; count++; });
                    const avg = count ? (sum / count) : 0;
                    await db.collection('products').doc(productId).update({
                        ratingAvg: Math.round(avg * 10) / 10,
                        ratingCount: count
                    });

                    this.showToast('Thank you for your review!');
                    this.setupStarPicker();
                    await this.loadProductReviews(productId);
                    this.loadHomeReviews();
                } catch (err) {
                    console.error('Submit review error', err);
                    this.showToast('Failed to submit review. Try again.');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-paper-plane text-sm"></i>';
                }
            },

            homeReviewRating: 0,

            populateHomeReviewProducts() {
                const sel = document.getElementById('home-review-product');
                if (!sel) return;
                const current = sel.value;
                sel.innerHTML = '<option value="">Select product...</option>' +
                    this.allProducts.map(p => `<option value="${p.id}">${(p.name || '').replace(/</g, '')}</option>`).join('');
                if (current) sel.value = current;
                // Star picker for home form
                document.querySelectorAll('.home-review-star').forEach(btn => {
                    btn.onclick = () => {
                        const val = parseInt(btn.dataset.star, 10);
                        this.homeReviewRating = val;
                        document.querySelectorAll('.home-review-star').forEach(b => {
                            const s = parseInt(b.dataset.star, 10);
                            if (s <= val) {
                                b.classList.remove('text-gray-300');
                                b.classList.add('text-yellow-400');
                            } else {
                                b.classList.remove('text-yellow-400');
                                b.classList.add('text-gray-300');
                            }
                        });
                        const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
                        document.getElementById('home-review-rating-label').textContent = labels[val] || '';
                    };
                });
            },

            async loadHomeReviews() {
                const listEl = document.getElementById('home-reviews-list');
                if (!listEl || typeof db === 'undefined') return;
                if (!this.allProducts.length) {
                    listEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No reviews yet. Be the first to comment!</p>';
                    return;
                }
                try {
                    const allReviews = [];
                    // Fetch recent reviews from each product (limit to avoid too many reads)
                    const productsWithReviews = this.allProducts.filter(p => p.ratingCount > 0).slice(0, 15);
                    const toFetch = productsWithReviews.length ? productsWithReviews : this.allProducts.slice(0, 10);
                    await Promise.all(toFetch.map(async (p) => {
                        const snap = await db.collection('products').doc(p.id)
                            .collection('reviews').orderBy('createdAt', 'desc').limit(3).get();
                        snap.forEach(doc => {
                            allReviews.push({
                                id: doc.id,
                                productId: p.id,
                                productName: p.name,
                                ...doc.data()
                            });
                        });
                    }));
                    // Sort by date desc
                    allReviews.sort((a, b) => {
                        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
                        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
                        return tb - ta;
                    });
                    const recent = allReviews.slice(0, 12);
                    if (recent.length === 0) {
                        listEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No reviews yet. Be the first to comment! 💬</p>';
                        return;
                    }
                    listEl.innerHTML = recent.map(r => {
                        const stars = this.renderStarsHtml(r.rating, 1, 'text-xs').replace(/\(\d+\)/, '');
                        const date = r.createdAt && r.createdAt.toDate
                            ? r.createdAt.toDate().toLocaleDateString('en-IN')
                            : '';
                        return `
                            <div class="bg-white border border-gray-100 rounded-xl p-4 flex gap-3 shadow-sm">
                                <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-user text-blue-400"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center justify-between gap-2 mb-0.5">
                                        <span class="font-semibold text-sm text-gray-900">${(r.name || 'Customer').replace(/</g, '&lt;')}</span>
                                        <span class="text-xs text-gray-400 flex-shrink-0">${date}</span>
                                    </div>
                                    <p class="text-xs text-blue-600 mb-1 truncate">${(r.productName || '').replace(/</g, '&lt;')}</p>
                                    <div class="mb-1">${stars}</div>
                                    <p class="text-sm text-gray-600">${(r.comment || '').replace(/</g, '&lt;')}</p>
                                </div>
                            </div>`;
                    }).join('');
                } catch (err) {
                    console.error('Home reviews error', err);
                    listEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Could not load reviews.</p>';
                }
            },

            async submitHomeReview() {
                const productId = document.getElementById('home-review-product').value;
                const name = (document.getElementById('home-review-name').value || '').trim();
                const comment = (document.getElementById('home-review-comment').value || '').trim();
                const rating = this.homeReviewRating;

                if (!productId) { this.showToast('Please select a product'); return; }
                if (!name) { this.showToast('Please enter your name'); return; }
                if (!rating || rating < 1) { this.showToast('Please select star rating'); return; }
                if (!comment) { this.showToast('Please write a comment'); return; }

                const btn = document.getElementById('home-review-submit-btn');
                btn.disabled = true;

                try {
                    await db.collection('products').doc(productId).collection('reviews').add({
                        name, rating, comment,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    const snap = await db.collection('products').doc(productId).collection('reviews').get();
                    let sum = 0, count = 0;
                    snap.forEach(d => { sum += d.data().rating || 0; count++; });
                    await db.collection('products').doc(productId).update({
                        ratingAvg: Math.round((sum / count) * 10) / 10,
                        ratingCount: count
                    });
                    this.showToast('Thank you for your review! 💬');
                    document.getElementById('home-review-name').value = '';
                    document.getElementById('home-review-comment').value = '';
                    document.getElementById('home-review-product').value = '';
                    this.homeReviewRating = 0;
                    document.querySelectorAll('.home-review-star').forEach(b => {
                        b.classList.remove('text-yellow-400');
                        b.classList.add('text-gray-300');
                    });
                    document.getElementById('home-review-rating-label').textContent = 'Tap stars';
                    await this.loadHomeReviews();
                } catch (err) {
                    console.error(err);
                    this.showToast('Failed to submit. Try again.');
                } finally {
                    btn.disabled = false;
                }
            },

            renderProducts(filter = 'all') {
                const grid = document.getElementById('products-grid');
                
                if (this.products.length === 0) {
                    grid.innerHTML = `
                        <div class="col-span-3 text-center py-16">
                            <div class="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i class="fas fa-box-open text-3xl text-blue-300"></i>
                            </div>
                            <p class="text-gray-400 text-lg font-medium">Coming Soon!</p>
                            <p class="text-gray-400 text-sm mt-1">Products in this category will be added soon.</p>
                        </div>`;
                    return;
                }

                grid.innerHTML = this.products.map((product, idx) => {
                    const discount = Math.round(((product.original - product.price) / product.original) * 100);
                    const hasVideo = product.video ? true : false;
                    const images = product.images && product.images.length > 0 ? product.images : (product.image ? [product.image] : []);
                    const hasGallery = images.length > 1;
                    
                    let mediaHtml = '';
                    // Prefer photo gallery when multiple images exist (so photos always show)
                    // If video also exists, show VIDEO badge on the gallery
                    if (hasGallery) {
                        const slides = images.map((src, i) => `
                            <div class="card-gallery-slide ${i === 0 ? 'active' : ''}">
                                <img src="${src}" alt="${product.name}" class="w-full h-full object-cover" onerror="this.src='https://via.placeholder.com/400x400/f1f5f9/64748b?text=${encodeURIComponent(product.name)}'">
                            </div>
                        `).join('');
                        const dots = images.map((_, i) => `
                            <span class="card-gallery-dot ${i === 0 ? 'active' : ''}"></span>
                        `).join('');
                        mediaHtml = `
                            <div class="card-gallery" data-index="${idx}" data-count="${images.length}">
                                <div class="card-gallery-track">
                                    ${slides}
                                </div>
                                <div class="card-gallery-dots">
                                    ${dots}
                                </div>
                                ${hasVideo ? `<div class="video-badge"><i class="fas fa-video"></i> VIDEO</div>` : ''}
                            </div>`;
                    } else if (hasVideo) {
                        mediaHtml = `
                            <div class="video-container">
                                <video class="product-video" muted loop playsinline preload="metadata" onmouseover="this.play()" onmouseout="this.pause()">
                                    <source src="${product.video}" type="video/mp4">
                                </video>
                                <div class="video-badge">
                                    <i class="fas fa-video"></i> VIDEO
                                </div>
                                <div class="video-play-icon">
                                    <i class="fas fa-play text-blue-600 text-xl"></i>
                                </div>
                            </div>`;
                    } else {
                        mediaHtml = `
                            <img src="${images[0] || product.image}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='https://via.placeholder.com/400x400/f1f5f9/64748b?text=${encodeURIComponent(product.name)}'">`;
                    }
                    
                    return `
                    <div class="product-card group" onclick="app.showProductDetail(${idx})">
                        <div class="product-image-container">
                            ${mediaHtml}
                            <div class="discount-float">
                                <i class="fas fa-tags"></i> -${discount}% OFF
                            </div>
                            <button onclick="event.stopPropagation(); app.addToCart(${idx})" class="add-to-cart-btn">
                                <i class="fas fa-cart-plus"></i> Add to Cart
                            </button>
                        </div>
                        <div class="p-5">
                            <div class="flex items-center gap-2 mb-2 flex-wrap">
                                <span class="text-xs font-medium text-blue-600 uppercase tracking-wide bg-blue-50 px-2 py-1 rounded-full">${product.category}</span>
                                ${product.cod !== false 
                                    ? '<span class="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">💵 COD Available</span>' 
                                    : '<span class="text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">❌ COD Not Available</span>'}
                                ${this.renderStarsHtml(product.ratingAvg, product.ratingCount, 'text-xs')}
                            </div>
                            <h4 class="font-heading font-semibold text-lg mb-1 text-gray-900">${product.name}</h4>
                            <p class="text-gray-500 text-sm mb-3">${product.desc}</p>
                            <div class="flex items-center justify-between">
                                <div>
                                    <span class="text-xl font-bold text-blue-600">${this.formatPrice(product.price)}</span>
                                    <span class="text-sm text-gray-400 line-through ml-2">${this.formatPrice(product.original)}</span>
                                </div>
                                <button onclick="event.stopPropagation(); app.addToCart(${idx})" class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
                    </div>`;
                }).join('');
                
                // Start auto-slideshow for card galleries
                this.startCardGalleries();
            },

            startCardGalleries() {
                // Clear previous intervals
                if (this._cardGalleryIntervals) {
                    this._cardGalleryIntervals.forEach(clearInterval);
                }
                this._cardGalleryIntervals = [];
                
                document.querySelectorAll('.card-gallery').forEach(gallery => {
                    const slides = gallery.querySelectorAll('.card-gallery-slide');
                    const dots = gallery.querySelectorAll('.card-gallery-dot');
                    if (slides.length <= 1) return;
                    
                    let current = 0;
                    const interval = setInterval(() => {
                        slides[current].classList.remove('active');
                        dots[current].classList.remove('active');
                        current = (current + 1) % slides.length;
                        slides[current].classList.add('active');
                        dots[current].classList.add('active');
                    }, 2500); // change every 2.5 seconds
                    
                    this._cardGalleryIntervals.push(interval);
                });
            },

            showProductDetail(index) {
                const product = this.products[index];
                const discount = Math.round(((product.original - product.price) / product.original) * 100);
                
                // Media container - Video + Image Gallery (both show when available)
                const mediaContainer = document.getElementById('modal-media-container');
                const hasVideo = product.video ? true : false;
                const images = product.images && product.images.length > 0 ? product.images : (product.image ? [product.image] : []);
                
                // Build combined media list: video first (if any), then photos
                const mediaItems = [];
                if (hasVideo) {
                    mediaItems.push({ type: 'video', src: product.video });
                }
                images.forEach(src => mediaItems.push({ type: 'image', src }));
                
                if (mediaItems.length > 1) {
                    // Combined swipeable gallery (video + photos)
                    const slides = mediaItems.map((item, i) => {
                        if (item.type === 'video') {
                            return `
                                <div class="gallery-slide">
                                    <div class="video-container h-full">
                                        <video class="product-video" muted loop playsinline controls ${i === 0 ? 'autoplay' : ''}>
                                            <source src="${item.src}" type="video/mp4">
                                            Your browser does not support the video tag.
                                        </video>
                                        <div class="video-badge"><i class="fas fa-video"></i> VIDEO</div>
                                    </div>
                                </div>`;
                        }
                        return `
                            <div class="gallery-slide">
                                <img src="${item.src}" alt="${product.name} - ${i+1}" onerror="this.src='https://via.placeholder.com/400x400/f1f5f9/64748b?text=${encodeURIComponent(product.name)}'">
                            </div>`;
                    }).join('');
                    
                    const dots = mediaItems.map((item, i) => `
                        <button class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}" onclick="app.goToSlide(${i})" title="${item.type === 'video' ? 'Video' : 'Photo ' + i}">
                            ${item.type === 'video' ? '<i class="fas fa-video text-xs"></i>' : ''}
                        </button>
                    `).join('');
                    
                    mediaContainer.innerHTML = `
                        <div class="gallery-wrapper h-full">
                            <div class="gallery-track" id="gallery-track">
                                ${slides}
                            </div>
                            <button class="gallery-nav prev" onclick="app.prevSlide()">
                                <i class="fas fa-chevron-left text-gray-700"></i>
                            </button>
                            <button class="gallery-nav next" onclick="app.nextSlide()">
                                <i class="fas fa-chevron-right text-gray-700"></i>
                            </button>
                            <div class="gallery-dots" id="gallery-dots">
                                ${dots}
                            </div>
                            <button onclick="app.closeProductModal()" class="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors md:hidden z-20">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                    
                    // Track current slide + sync dots + pause/play video
                    this._galleryIndex = 0;
                    this._galleryCount = mediaItems.length;
                    const track = document.getElementById('gallery-track');
                    if (track) {
                        track.addEventListener('scroll', () => {
                            const idx = Math.round(track.scrollLeft / track.clientWidth);
                            if (idx !== this._galleryIndex) {
                                this._galleryIndex = idx;
                                this.updateGalleryDots();
                                this.handleGalleryVideo(idx);
                            }
                        });
                    }
                    // Ensure first video plays
                    this.handleGalleryVideo(0);
                } else if (hasVideo) {
                    // Only video
                    mediaContainer.innerHTML = `
                        <div class="video-container h-full">
                            <video class="product-video" autoplay muted loop playsinline controls>
                                <source src="${product.video}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                            <button onclick="app.closeProductModal()" class="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors md:hidden z-20">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                } else if (images.length === 1) {
                    // Single image
                    const imgSrc = images[0] || product.image;
                    mediaContainer.innerHTML = `
                        <img id="modal-product-image" src="${imgSrc}" class="w-full h-full object-cover" alt="${product.name}" onerror="this.src='https://via.placeholder.com/400x400/f1f5f9/64748b?text=${encodeURIComponent(product.name)}'">
                        <button onclick="app.closeProductModal()" class="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors md:hidden z-20">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                } else {
                    // Fallback empty
                    mediaContainer.innerHTML = `
                        <div class="w-full h-full bg-gray-100 flex items-center justify-center">
                            <i class="fas fa-image text-4xl text-gray-300"></i>
                        </div>
                    `;
                }
                
                document.getElementById('modal-product-category').textContent = product.category;
                document.getElementById('modal-product-name').textContent = product.name;
                document.getElementById('modal-product-desc').textContent = product.desc;
                document.getElementById('modal-product-price').textContent = this.formatPrice(product.price);
                document.getElementById('modal-product-original').textContent = this.formatPrice(product.original);
                document.getElementById('modal-product-discount').textContent = `-${discount}% OFF`;

                // COD status badge
                const codEl = document.getElementById('modal-product-cod');
                if (product.cod !== false) {
                    codEl.textContent = '💵 COD Available';
                    codEl.className = 'text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full';
                } else {
                    codEl.textContent = '❌ COD Not Available';
                    codEl.className = 'text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full';
                }

                // Real reviews (no fake numbers)
                this.currentReviewProductId = product.id || null;
                this.setupStarPicker();
                // Show cached avg on product first, then load full list
                document.getElementById('modal-product-stars').innerHTML =
                    this.renderStarsHtml(product.ratingAvg, product.ratingCount, 'text-sm');
                document.getElementById('modal-product-review-count').textContent = '';
                this.loadProductReviews(product.id);
                
                document.getElementById('modal-add-to-cart').onclick = () => { 
                    this.addToCart(index); 
                    this.closeProductModal(); 
                };
                
                document.getElementById('modal-whatsapp-enquire').onclick = () => {
                    this.enquireWhatsApp(product);
                };
                
                const modal = document.getElementById('product-modal');
                const content = modal.querySelector('.modal-content');
                modal.classList.remove('hidden');
                setTimeout(() => { 
                    content.classList.remove('scale-95', 'opacity-0'); 
                    content.classList.add('scale-100', 'opacity-100'); 
                }, 10);
            },

            goToSlide(index) {
                const track = document.getElementById('gallery-track');
                if (!track) return;
                this._galleryIndex = index;
                track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
                this.updateGalleryDots();
                this.handleGalleryVideo(index);
            },

            nextSlide() {
                if (this._galleryIndex < this._galleryCount - 1) {
                    this.goToSlide(this._galleryIndex + 1);
                } else {
                    this.goToSlide(0);
                }
            },

            prevSlide() {
                if (this._galleryIndex > 0) {
                    this.goToSlide(this._galleryIndex - 1);
                } else {
                    this.goToSlide(this._galleryCount - 1);
                }
            },

            updateGalleryDots() {
                const dots = document.querySelectorAll('#gallery-dots .gallery-dot');
                dots.forEach((dot, i) => {
                    if (i === this._galleryIndex) {
                        dot.classList.add('active');
                    } else {
                        dot.classList.remove('active');
                    }
                });
            },

            handleGalleryVideo(activeIndex) {
                const track = document.getElementById('gallery-track');
                if (!track) return;
                const slides = track.querySelectorAll('.gallery-slide');
                slides.forEach((slide, i) => {
                    const video = slide.querySelector('video');
                    if (video) {
                        if (i === activeIndex) {
                            video.play().catch(() => {});
                        } else {
                            video.pause();
                        }
                    }
                });
            },

            closeProductModal() {
                const modal = document.getElementById('product-modal');
                const content = modal.querySelector('.modal-content');
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    // Stop any playing videos
                    const videos = modal.querySelectorAll('video');
                    videos.forEach(v => v.pause());
                }, 300);
            },

            enquireWhatsApp(product) {
                const message = `Hi, I'm interested in this product:%0A%0A*${product.name}*%0ACategory: ${product.category}%0APrice: ${this.formatPrice(product.price)}%0AOriginal: ${this.formatPrice(product.original)}%0A%0ACan you provide more details?`;
                window.open(`https://wa.me/917092427154?text=${message}`, '_blank');
                this.showToast('Opening WhatsApp...');
            },

            addToCart(index) {
                const product = this.products[index];
                const existing = this.cart.find(item => !item.isCombo && item.name === product.name);
                if (existing) { 
                    existing.quantity++; 
                } else { 
                    this.cart.push({ ...product, quantity: 1 }); 
                }
                this.updateCartBadge();
                this.showToast(`${product.name} added to cart`);
            },

            // ========== COMBO OFFERS ==========
            renderCombos() {
                const grid = document.getElementById('combos-grid');
                if (!grid) return;
                if (!this.allCombos.length) {
                    grid.innerHTML = '<p class="col-span-full text-sm text-gray-400 text-center py-6">No combo offers yet. Check back soon! 🎁</p>';
                    return;
                }
                grid.innerHTML = this.allCombos.map((c, idx) => {
                    const save = (c.originalPrice || 0) - (c.comboPrice || 0);
                    const savePct = c.originalPrice > 0 ? Math.round((save / c.originalPrice) * 100) : 0;
                    const imgs = (c.productImages || []).slice(0, 3);
                    const names = (c.productNames || []).join(' + ');
                    return `
                        <div class="bg-white rounded-2xl border border-pink-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                            <div class="relative bg-gradient-to-br from-pink-50 to-orange-50 p-4 flex items-center justify-center gap-2 min-h-[120px]">
                                ${imgs.map(src => `<img src="${src}" class="w-16 h-16 object-cover rounded-xl border-2 border-white shadow" onerror="this.style.display='none'">`).join('')}
                                ${savePct > 0 ? `<span class="absolute top-2 left-2 bg-pink-500 text-white text-xs font-bold px-2 py-1 rounded-full">Save ${savePct}%</span>` : ''}
                                <span class="absolute top-2 right-2 bg-white/90 text-pink-600 text-xs font-semibold px-2 py-1 rounded-full"><i class="fas fa-gift"></i> Combo</span>
                            </div>
                            <div class="p-4">
                                <h4 class="font-semibold text-gray-900 mb-1">${(c.name || 'Combo').replace(/</g, '&lt;')}</h4>
                                <p class="text-xs text-gray-500 mb-2 line-clamp-2">${names.replace(/</g, '&lt;')}</p>
                                ${c.desc ? `<p class="text-xs text-gray-400 mb-2">${(c.desc || '').replace(/</g, '&lt;')}</p>` : ''}
                                <div class="flex items-center gap-2 mb-3">
                                    <span class="text-xl font-bold text-pink-600">${this.formatPrice(c.comboPrice || 0)}</span>
                                    <span class="text-sm text-gray-400 line-through">${this.formatPrice(c.originalPrice || 0)}</span>
                                </div>
                                <button onclick="app.addComboToCart(${idx})" class="w-full bg-pink-600 hover:bg-pink-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                                    <i class="fas fa-cart-plus mr-1"></i> Add Combo to Cart
                                </button>
                            </div>
                        </div>`;
                }).join('');
            },

            addComboToCart(idx) {
                const c = this.allCombos[idx];
                if (!c) return;
                const existing = this.cart.find(item => item.isCombo && item.comboId === c.id);
                if (existing) {
                    existing.quantity++;
                } else {
                    // COD: available only if all included products allow COD
                    let codOk = true;
                    let codCharge = 0;
                    (c.productIds || []).forEach(pid => {
                        const p = this.allProducts.find(x => x.id === pid);
                        if (p) {
                            if (p.cod === false) codOk = false;
                            codCharge += (p.codCharge || 0);
                        }
                    });
                    this.cart.push({
                        isCombo: true,
                        comboId: c.id,
                        name: c.name || 'Combo Offer',
                        desc: (c.productNames || []).join(' + '),
                        category: 'Combo',
                        price: c.comboPrice || 0,
                        original: c.originalPrice || 0,
                        image: (c.productImages && c.productImages[0]) || '',
                        quantity: 1,
                        cod: codOk,
                        codCharge: codOk ? codCharge : 0,
                        comboItems: c.productNames || []
                    });
                }
                this.updateCartBadge();
                this.showToast(`${c.name} added to cart 🎁`);
            },

            showAddComboForm() {
                document.getElementById('admin-form').classList.add('hidden');
                document.getElementById('admin-combo-form').classList.remove('hidden');
                document.getElementById('combo-form-title').textContent = 'Add Combo Offer';
                document.getElementById('c-name').value = '';
                document.getElementById('c-desc').value = '';
                document.getElementById('c-price').value = '';
                document.getElementById('c-edit-id').value = '';
                document.getElementById('c-original-preview').textContent = '₹0';
                this.renderComboProductChecks();
            },

            hideComboForm() {
                document.getElementById('admin-combo-form').classList.add('hidden');
            },

            renderComboProductChecks(selectedIds = []) {
                const box = document.getElementById('c-product-checks');
                if (!box) return;
                if (!this.allProducts.length) {
                    box.innerHTML = '<p class="text-sm text-gray-400">No products. Add products first.</p>';
                    return;
                }
                box.innerHTML = this.allProducts.map(p => `
                    <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-pink-50 cursor-pointer text-sm">
                        <input type="checkbox" class="c-prod-check w-4 h-4 text-pink-600" value="${p.id}" data-price="${p.price || 0}" data-name="${(p.name || '').replace(/"/g, '&quot;')}" data-image="${p.image || (p.images && p.images[0]) || ''}"
                            ${selectedIds.includes(p.id) ? 'checked' : ''} onchange="app.updateComboOriginalPreview()">
                        <img src="${p.image || (p.images && p.images[0]) || ''}" class="w-8 h-8 rounded object-cover bg-gray-100" onerror="this.style.display='none'">
                        <span class="flex-1 truncate">${(p.name || '').replace(/</g, '&lt;')}</span>
                        <span class="text-gray-500 text-xs">₹${p.price || 0}</span>
                    </label>
                `).join('');
                this.updateComboOriginalPreview();
            },

            updateComboOriginalPreview() {
                let total = 0;
                document.querySelectorAll('.c-prod-check:checked').forEach(cb => {
                    total += parseInt(cb.dataset.price, 10) || 0;
                });
                document.getElementById('c-original-preview').textContent = this.formatPrice(total);
            },

            async saveCombo() {
                const name = (document.getElementById('c-name').value || '').trim();
                const desc = (document.getElementById('c-desc').value || '').trim();
                const comboPrice = parseInt(document.getElementById('c-price').value, 10) || 0;
                const editId = document.getElementById('c-edit-id').value;
                const checks = [...document.querySelectorAll('.c-prod-check:checked')];

                if (!name) { this.showToast('Enter combo name'); return; }
                if (checks.length < 2) { this.showToast('Select at least 2 products'); return; }
                if (comboPrice <= 0) { this.showToast('Enter combo price'); return; }

                const productIds = checks.map(c => c.value);
                const productNames = checks.map(c => c.dataset.name);
                const productImages = checks.map(c => c.dataset.image).filter(Boolean);
                let originalPrice = 0;
                checks.forEach(c => { originalPrice += parseInt(c.dataset.price, 10) || 0; });

                const btn = document.getElementById('c-save-btn');
                btn.disabled = true;
                btn.textContent = 'Saving...';

                try {
                    const data = {
                        name, desc, productIds, productNames, productImages,
                        comboPrice, originalPrice,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (editId) {
                        await db.collection('combos').doc(editId).update({
                            name, desc, productIds, productNames, productImages, comboPrice, originalPrice
                        });
                        this.showToast('Combo updated');
                    } else {
                        await db.collection('combos').add(data);
                        this.showToast('Combo added 🎁');
                    }
                    this.hideComboForm();
                } catch (err) {
                    console.error(err);
                    this.showToast('Failed to save combo');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Save Combo';
                }
            },

            editCombo(id) {
                const c = this.allCombos.find(x => x.id === id);
                if (!c) return;
                document.getElementById('admin-form').classList.add('hidden');
                document.getElementById('admin-combo-form').classList.remove('hidden');
                document.getElementById('combo-form-title').textContent = 'Edit Combo Offer';
                document.getElementById('c-name').value = c.name || '';
                document.getElementById('c-desc').value = c.desc || '';
                document.getElementById('c-price').value = c.comboPrice || '';
                document.getElementById('c-edit-id').value = c.id;
                this.renderComboProductChecks(c.productIds || []);
            },

            async deleteCombo(id) {
                if (!confirm('Delete this combo offer?')) return;
                try {
                    await db.collection('combos').doc(id).delete();
                    this.showToast('Combo deleted');
                } catch (err) {
                    console.error(err);
                    this.showToast('Failed to delete combo');
                }
            },

            renderAdminCombos() {
                const list = document.getElementById('admin-combo-list');
                if (!list) return;
                if (!this.allCombos.length) {
                    list.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">No combos yet. Click "Add Combo".</p>';
                    return;
                }
                list.innerHTML = this.allCombos.map(c => `
                    <div class="flex items-center gap-3 bg-white border border-pink-100 rounded-xl p-3">
                        <div class="flex -space-x-2">
                            ${(c.productImages || []).slice(0, 2).map(src =>
                                `<img src="${src}" class="w-10 h-10 rounded-lg object-cover border-2 border-white" onerror="this.style.display='none'">`
                            ).join('')}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-semibold text-sm text-gray-900 truncate">${(c.name || '').replace(/</g, '&lt;')}</h4>
                            <p class="text-xs text-gray-500 truncate">${(c.productNames || []).join(' + ')}</p>
                            <p class="text-sm"><span class="font-bold text-pink-600">${this.formatPrice(c.comboPrice)}</span>
                                <span class="text-gray-400 line-through text-xs ml-1">${this.formatPrice(c.originalPrice)}</span></p>
                        </div>
                        <button onclick="app.editCombo('${c.id}')" class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><i class="fas fa-edit"></i></button>
                        <button onclick="app.deleteCombo('${c.id}')" class="w-9 h-9 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><i class="fas fa-trash"></i></button>
                    </div>
                `).join('');
            },

            updateCartBadge() {
                const count = this.cart.reduce((sum, item) => sum + item.quantity, 0);
                const badge = document.getElementById('cart-badge');
                if (count > 0) { 
                    badge.textContent = count; 
                    badge.classList.remove('hidden'); 
                } else { 
                    badge.classList.add('hidden'); 
                }
            },

            showCart() {
                if (this.cart.length === 0) { 
                    this.showToast('Your cart is empty'); 
                    return; 
                }
                this.openCheckout();
            },

            openCheckout() {
                this.currentStep = 1;
                this.renderCheckoutItems();
                this.updateSteps();
                const overlay = document.getElementById('checkout-overlay');
                const content = document.getElementById('checkout-content');
                overlay.classList.remove('hidden');
                setTimeout(() => { 
                    content.classList.remove('scale-95', 'opacity-0'); 
                    content.classList.add('scale-100', 'opacity-100'); 
                }, 10);
            },

            closeCheckout() {
                const overlay = document.getElementById('checkout-overlay');
                const content = document.getElementById('checkout-content');
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            },

            renderCheckoutItems() {
                const container = document.getElementById('checkout-items');
                const emptyMsg = document.getElementById('empty-cart-msg');
                const summary = document.getElementById('cart-summary');
                const continueBtn = document.getElementById('continue-btn');
                const countEl = document.getElementById('cart-item-count');
                
                if (this.cart.length === 0) {
                    container.innerHTML = '';
                    emptyMsg.classList.remove('hidden');
                    summary.classList.add('hidden');
                    continueBtn.classList.add('hidden');
                    countEl.textContent = '0 items';
                    return;
                }
                
                emptyMsg.classList.add('hidden');
                summary.classList.remove('hidden');
                continueBtn.classList.remove('hidden');
                
                const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
                countEl.textContent = `${totalItems} item${totalItems > 1 ? 's' : ''}`;
                
                const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                
                container.innerHTML = this.cart.map((item, idx) => `
                    <div class="flex items-center gap-4 p-3 ${item.isCombo ? 'bg-pink-50 border border-pink-100' : 'bg-gray-50'} rounded-xl">
                        <img src="${item.image}" class="w-16 h-16 rounded-lg object-cover bg-gray-100">
                        <div class="flex-1">
                            <h4 class="font-medium text-gray-900">${item.isCombo ? '🎁 ' : ''}${item.name}</h4>
                            <p class="text-xs text-gray-500">${item.isCombo ? (item.comboItems || []).join(' + ') : item.category}</p>
                            <div class="flex items-center gap-3 mt-2">
                                <button onclick="app.updateQuantity(${idx}, -1)" class="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors">-</button>
                                <span class="font-medium w-6 text-center">${item.quantity}</span>
                                <button onclick="app.updateQuantity(${idx}, 1)" class="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors">+</button>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="font-bold ${item.isCombo ? 'text-pink-600' : 'text-blue-600'}">${this.formatPrice(item.price * item.quantity)}</p>
                            <button onclick="app.removeItem(${idx})" class="text-xs text-red-500 hover:text-red-700 mt-1">Remove</button>
                        </div>
                    </div>`).join('');
                    
                const codCharge = this.getCartCodCharge();
                const grandTotal = subtotal + codCharge;

                document.getElementById('checkout-subtotal').textContent = this.formatPrice(subtotal);
                const codEl = document.getElementById('checkout-cod-charge');
                if (codCharge > 0) {
                    codEl.textContent = this.formatPrice(codCharge);
                    codEl.className = 'font-medium text-orange-600';
                } else {
                    codEl.textContent = '₹0';
                    codEl.className = 'font-medium text-green-600';
                }
                document.getElementById('checkout-total').textContent = this.formatPrice(grandTotal);
            },

            updateQuantity(idx, change) {
                this.cart[idx].quantity += change;
                if (this.cart[idx].quantity <= 0) this.cart.splice(idx, 1);
                this.updateCartBadge();
                this.renderCheckoutItems();
            },

            removeItem(idx) {
                this.cart.splice(idx, 1);
                this.updateCartBadge();
                this.renderCheckoutItems();
            },

            isCartCodAvailable() {
                // All items must allow COD (cod !== false). Missing field = available.
                if (!this.cart || this.cart.length === 0) return true;
                return this.cart.every(item => item.cod !== false);
            },

            getCartCodCharge() {
                // Sum COD extra charges only if COD is available for the whole cart
                if (!this.isCartCodAvailable()) return 0;
                return this.cart.reduce((sum, item) => {
                    const charge = (item.codCharge != null && item.codCharge > 0) ? Number(item.codCharge) : 0;
                    return sum + (charge * (item.quantity || 1));
                }, 0);
            },

            updateCodStatusUI() {
                const available = this.isCartCodAvailable();
                const label = available ? '✅ Available' : '❌ Not Available';
                const colorClass = available
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800';

                const addrBox = document.getElementById('addr-cod-status');
                const addrLabel = document.getElementById('addr-cod-label');
                if (addrBox && addrLabel) {
                    addrBox.className = 'rounded-xl p-3 border text-sm font-medium ' + colorClass;
                    addrLabel.textContent = label;
                }

                const statusText = document.getElementById('cod-status-text');
                const statusBox = document.getElementById('cod-status-box');
                if (statusText) {
                    statusText.textContent = available
                        ? '💵 Cash on Delivery: ✅ Available'
                        : '💵 Cash on Delivery: ❌ Not Available';
                    statusText.className = available
                        ? 'text-sm font-semibold mt-2 text-green-700'
                        : 'text-sm font-semibold mt-2 text-red-700';
                }
                if (statusBox) {
                    statusBox.className = available
                        ? 'bg-green-50 border border-green-200 rounded-xl p-4 mb-6'
                        : 'bg-red-50 border border-red-200 rounded-xl p-4 mb-6';
                }
            },

            goToStep(step) {
                document.querySelectorAll('.checkout-step').forEach(el => el.classList.add('hidden'));
                document.getElementById(`checkout-step-${step}`).classList.remove('hidden');
                this.currentStep = step;
                this.updateSteps();
                if (step === 2 || step === 3) this.updateCodStatusUI();
                if (step === 3) this.renderConfirmation();
            },

            updateSteps() {
                [1, 2, 3].forEach(i => {
                    const el = document.getElementById(`step-${i}`);
                    el.className = 'step';
                    if (i < this.currentStep) {
                        el.classList.add('completed');
                        el.innerHTML = '<i class="fas fa-check text-sm"></i>';
                        if (document.getElementById(`progress-${i}`)) document.getElementById(`progress-${i}`).style.width = '100%';
                    } else if (i === this.currentStep) { 
                        el.classList.add('active'); 
                        el.textContent = i; 
                    } else { 
                        el.classList.add('pending'); 
                        el.textContent = i; 
                    }
                });
            },

            renderConfirmation() {
                const name = document.getElementById('addr-name').value;
                const phone = document.getElementById('addr-phone').value;
                const email = document.getElementById('addr-email').value;
                const street = document.getElementById('addr-street').value;
                const city = document.getElementById('addr-city').value;
                const pincode = document.getElementById('addr-pincode').value;
                const state = document.getElementById('addr-state').value;
                const notes = document.getElementById('addr-notes').value;
                
                document.getElementById('confirm-address').innerHTML = `
                    <p class="font-semibold">${name}</p><p>${phone}</p>${email ? `<p>${email}</p>` : ''}
                    <p class="mt-2">${street}</p><p>${city}, ${state} - ${pincode}</p>
                    ${notes ? `<p class="mt-2 italic">Note: ${notes}</p>` : ''}`;
                    
                const container = document.getElementById('confirm-items');
                container.innerHTML = this.cart.map(item => `
                    <div class="flex justify-between py-2 border-b border-gray-100">
                        <span>${item.name} × ${item.quantity}</span>
                        <span class="font-medium">${this.formatPrice(item.price * item.quantity)}</span>
                    </div>`).join('');
                    
                const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const codCharge = this.getCartCodCharge();
                const grandTotal = subtotal + codCharge;

                document.getElementById('confirm-subtotal').textContent = this.formatPrice(subtotal);
                document.getElementById('confirm-cod-charge').textContent = this.formatPrice(codCharge);
                document.getElementById('confirm-total').textContent = this.formatPrice(grandTotal);
            },

            placeOrder() {
                const name = document.getElementById('addr-name').value;
                const phone = document.getElementById('addr-phone').value;
                const email = document.getElementById('addr-email').value;
                const street = document.getElementById('addr-street').value;
                const city = document.getElementById('addr-city').value;
                const pincode = document.getElementById('addr-pincode').value;
                const state = document.getElementById('addr-state').value;
                const notes = document.getElementById('addr-notes').value;
                
                let message = `*New Order - Alhamdulillah Gadgets*%0A%0A*Customer:*%0AName: ${name}%0APhone: ${phone}%0A`;
                if (email) message += `Email: ${email}%0A`;
                message += `%0A*Delivery Address:*%0A${street}%0A${city}, ${state} - ${pincode}%0A`;
                if (notes) message += `%0ANote: ${notes}%0A`;
                message += `%0A*Order Items:*%0A`;
                
                this.cart.forEach((item, i) => {
                    if (item.isCombo) {
                        message += `${i+1}. 🎁 *COMBO:* ${item.name}%0A   Includes: ${(item.comboItems || []).join(', ')}%0A   Qty: ${item.quantity} | ${this.formatPrice(item.price)}%0A   Subtotal: ${this.formatPrice(item.price * item.quantity)}%0A%0A`;
                    } else {
                        message += `${i+1}. ${item.name}%0A   Qty: ${item.quantity} | ${this.formatPrice(item.price)} each%0A   Subtotal: ${this.formatPrice(item.price * item.quantity)}%0A%0A`;
                    }
                });
                
                const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const codCharge = this.getCartCodCharge();
                const grandTotal = subtotal + codCharge;
                const codOk = this.isCartCodAvailable();

                message += `Subtotal: ${this.formatPrice(subtotal)}%0A`;
                if (codCharge > 0) {
                    message += `COD Extra Charge: ${this.formatPrice(codCharge)}%0A`;
                }
                message += `*Total: ${this.formatPrice(grandTotal)}*%0APayment: ${codOk ? 'Cash on Delivery ✅' : 'COD Not Available ❌'}`;
                
                window.open(`https://wa.me/917092427154?text=${message}`, '_blank');
                this.showToast('Opening WhatsApp...');
                
                setTimeout(() => { 
                    this.cart = []; 
                    this.updateCartBadge(); 
                    this.closeCheckout(); 
                    this.showToast('Order sent!'); 
                }, 2000);
            },

            showModal(type) {
                const content = document.getElementById('modal-content');
                const overlay = document.getElementById('modal-overlay');
                let html = '';
                
                if (type === 'search') {
                    html = `<div class="flex justify-between items-center mb-4"><h3 class="font-heading text-xl font-bold">Search Products</h3><button onclick="app.closeModal()" class="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center"><i class="fas fa-times"></i></button></div>
                    <div class="relative mb-4"><input type="text" class="form-input pl-10" placeholder="Search products..." onkeyup="app.handleSearch(this.value)"><i class="fas fa-search absolute left-4 top-3.5 text-gray-400"></i></div>
                    <div id="search-results" class="space-y-2 max-h-60 overflow-y-auto"></div>`;
                } else if (type === 'menu') {
                    html = `<div class="flex justify-between items-center mb-4 sticky top-0 bg-white z-10 pb-2"><h3 class="font-heading text-xl font-bold">Menu</h3><button onclick="app.closeModal()" class="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center"><i class="fas fa-times"></i></button></div>
                    <nav class="space-y-1 max-h-[70vh] overflow-y-auto pb-4">
                        <a href="#" onclick="app.closeModal(); app.goHome()" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center"><i class="fas fa-home text-purple-600"></i></span> Home</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('smartwatch')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-clock text-blue-600"></i></span> Smart Watches</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('automaticwatch')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center"><i class="fas fa-stopwatch text-indigo-600"></i></span> Automatic Watches</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('menswatch')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-clock text-blue-600"></i></span> Men's Watches</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('womenswatch')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><i class="fas fa-clock text-pink-600"></i></span> Women's Watches</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('powerbank')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><i class="fas fa-battery-full text-green-600"></i></span> Powerbanks</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('neckband')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><i class="fas fa-headphones text-pink-600"></i></span> Neckbands</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('headphone')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-headphones-alt text-blue-600"></i></span> Headphones</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('earbuds')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><i class="fas fa-headphones text-pink-600"></i></span> Earbuds</a>
                        <a href="#" onclick="app.closeModal(); app.filterCategory('speaker')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><i class="fas fa-volume-up text-green-600"></i></span> Speakers</a>
                        <a href="#" onclick="app.closeModal(); app.showCart()" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><i class="fas fa-shopping-cart text-blue-600"></i></span> Cart</a>
                        <a href="https://wa.me/917092427154" target="_blank" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><i class="fab fa-whatsapp text-green-600"></i></span> Contact Us</a>
                        <a href="#" onclick="app.closeModal(); app.openAdmin()" class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"><span class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center"><i class="fas fa-cog text-gray-600"></i></span> Admin</a>
                    </nav>`;
                } else if (type === 'orders') {
                    html = `<div class="flex justify-between items-center mb-4"><h3 class="font-heading text-xl font-bold">My Orders</h3><button onclick="app.closeModal()" class="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center"><i class="fas fa-times"></i></button></div>
                    <div class="text-center py-8 text-gray-400"><div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-box text-3xl text-gray-300"></i></div><p>No orders yet.</p><button onclick="app.closeModal(); app.scrollToProducts()" class="mt-4 text-blue-600 font-medium hover:underline">Browse Products</button></div>`;
                }
                
                content.innerHTML = html;
                overlay.classList.remove('hidden');
                setTimeout(() => { 
                    content.classList.remove('scale-95', 'opacity-0'); 
                    content.classList.add('scale-100', 'opacity-100'); 
                }, 10);
            },

            closeModal() {
                const content = document.getElementById('modal-content');
                const overlay = document.getElementById('modal-overlay');
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            },

            handleSearch(query) {
                const results = document.getElementById('search-results');
                if (!query.trim()) { 
                    results.innerHTML = ''; 
                    return; 
                }
                
                const filtered = this.products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
                
                if (filtered.length === 0) { 
                    results.innerHTML = '<p class="text-center text-gray-400 py-4">No products found</p>'; 
                    return; 
                }
                
                results.innerHTML = filtered.map(p => {
                    const idx = this.products.indexOf(p);
                    return `<div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors" onclick="app.closeModal(); app.showProductDetail(${idx})">
                        <img src="${p.image}" class="w-12 h-12 rounded-lg object-cover bg-gray-100">
                        <div class="flex-1"><p class="font-medium text-gray-900">${p.name}</p><p class="text-sm text-blue-600">${this.formatPrice(p.price)}</p></div>
                    </div>`;
                }).join('');
            },

            handleHomeSearch(query) {
                const results = document.getElementById('home-search-results');
                if (!results) return;
                if (!query.trim()) {
                    results.innerHTML = '';
                    results.classList.add('hidden');
                    // Show all products again
                    this.applyFilter(this.currentCategory || 'all');
                    return;
                }
                results.classList.remove('hidden');
                const list = this.allProducts.length ? this.allProducts : this.products;
                const filtered = list.filter(p =>
                    (p.name && p.name.toLowerCase().includes(query.toLowerCase())) ||
                    (p.category && p.category.toLowerCase().includes(query.toLowerCase())) ||
                    (p.desc && p.desc.toLowerCase().includes(query.toLowerCase()))
                );
                // Also filter the main grid
                this.products = filtered;
                this.renderProducts(this.currentCategory || 'all');

                if (filtered.length === 0) {
                    results.innerHTML = '<p class="text-center text-gray-400 py-3 text-sm">No products found</p>';
                    return;
                }
                results.innerHTML = filtered.slice(0, 5).map(p => {
                    const img = p.image || (p.images && p.images[0]) || '';
                    return `<div class="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors shadow-sm" onclick="app.openProductById('${p.id || ''}')">
                        <img src="${img}" class="w-12 h-12 rounded-lg object-cover bg-gray-100" onerror="this.src='https://via.placeholder.com/48'">
                        <div class="flex-1 min-w-0"><p class="font-medium text-gray-900 truncate">${p.name}</p><p class="text-sm text-blue-600">${this.formatPrice(p.price)}</p></div>
                    </div>`;
                }).join('');
            },

            openProductById(id) {
                if (!id) return;
                const idx = this.products.findIndex(p => p.id === id);
                if (idx >= 0) this.showProductDetail(idx);
                else {
                    // try allProducts
                    const p = this.allProducts.find(x => x.id === id);
                    if (p) {
                        this.products = [p];
                        this.showProductDetail(0);
                    }
                }
            },

            filterCategory(cat) {
                this.currentCategory = cat;
                this.applyFilter(cat);
                document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
                const map = { all: 'btn-all', smartwatch: 'btn-smartwatch', automaticwatch: 'btn-automaticwatch', menswatch: 'btn-menswatch', womenswatch: 'btn-womenswatch', powerbank: 'btn-powerbank', neckband: 'btn-neckband', headphone: 'btn-headphone', earbuds: 'btn-earbuds', speaker: 'btn-speaker' };
                if (map[cat]) document.getElementById(map[cat]).classList.add('active');
            },

            showToast(msg) {
                const toast = document.getElementById('toast');
                document.getElementById('toast-message').textContent = msg;
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3000);
            },


            // ========== ADMIN PANEL ==========
            // Only this Google account can manage products
            ownerEmail: 'muzzammil1704@gmail.com',
            editingIndex: -1,
            originalProducts: null,
            adminCategoryFilter: 'All',

            openAdmin() {
                const modal = document.getElementById('admin-modal');
                const content = document.getElementById('admin-content');
                modal.classList.remove('hidden');
                setTimeout(() => {
                    content.classList.remove('scale-95', 'opacity-0');
                    content.classList.add('scale-100', 'opacity-100');
                }, 10);
                // Check if already signed in as the owner
                const user = auth.currentUser;
                if (user && user.email === this.ownerEmail) {
                    document.getElementById('admin-login').classList.add('hidden');
                    document.getElementById('admin-dashboard').classList.remove('hidden');
                    this.renderAdminList();
                    this.loadAdminReviews();
                }
            },

            closeAdmin() {
                const modal = document.getElementById('admin-modal');
                const content = document.getElementById('admin-content');
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
                setTimeout(() => modal.classList.add('hidden'), 300);
            },

            async adminLogin() {
                try {
                    const provider = new firebase.auth.GoogleAuthProvider();
                    const result = await auth.signInWithPopup(provider);
                    if (result.user.email === this.ownerEmail) {
                        document.getElementById('admin-login').classList.add('hidden');
                        document.getElementById('admin-dashboard').classList.remove('hidden');
                        this.renderAdminList();
                        this.loadAdminReviews();
                        this.showToast('Admin logged in');
                    } else {
                        await auth.signOut();
                        this.showToast('This Google account is not allowed');
                    }
                } catch (err) {
                    console.error(err);
                    this.showToast('Login failed: ' + err.message);
                }
            },

            async loadAdminReviews() {
                const listEl = document.getElementById('admin-reviews-list');
                if (!listEl || typeof db === 'undefined') return;
                listEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Loading reviews...</p>';
                try {
                    const allReviews = [];
                    const products = this.allProducts.slice(0, 30);
                    await Promise.all(products.map(async (p) => {
                        const snap = await db.collection('products').doc(p.id)
                            .collection('reviews').orderBy('createdAt', 'desc').limit(10).get();
                        snap.forEach(doc => {
                            allReviews.push({
                                id: doc.id,
                                productId: p.id,
                                productName: p.name,
                                ...doc.data()
                            });
                        });
                    }));
                    allReviews.sort((a, b) => {
                        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
                        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
                        return tb - ta;
                    });
                    if (allReviews.length === 0) {
                        listEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">No reviews yet.</p>';
                        return;
                    }
                    listEl.innerHTML = allReviews.map(r => {
                        const date = r.createdAt && r.createdAt.toDate
                            ? r.createdAt.toDate().toLocaleDateString('en-IN')
                            : '';
                        const stars = '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0));
                        return `
                            <div class="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-3">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="font-semibold text-sm text-gray-900">${(r.name || 'Customer').replace(/</g, '&lt;')}</span>
                                        <span class="text-xs text-gray-400">${date}</span>
                                    </div>
                                    <p class="text-xs text-blue-600 truncate">${(r.productName || '').replace(/</g, '&lt;')}</p>
                                    <p class="text-xs text-yellow-500 my-0.5">${stars}</p>
                                    <p class="text-sm text-gray-600 break-words">${(r.comment || '').replace(/</g, '&lt;')}</p>
                                </div>
                                <button onclick="app.deleteReview('${r.productId}', '${r.id}')"
                                    class="flex-shrink-0 w-9 h-9 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center"
                                    title="Delete review">
                                    <i class="fas fa-trash text-sm"></i>
                                </button>
                            </div>`;
                    }).join('');
                } catch (err) {
                    console.error('Admin reviews error', err);
                    listEl.innerHTML = '<p class="text-sm text-red-400 text-center py-4">Failed to load reviews.</p>';
                }
            },

            async deleteReview(productId, reviewId) {
                if (!confirm('Delete this review / comment?')) return;
                try {
                    await db.collection('products').doc(productId).collection('reviews').doc(reviewId).delete();
                    // Recalculate ratingAvg + ratingCount
                    const snap = await db.collection('products').doc(productId).collection('reviews').get();
                    let sum = 0, count = 0;
                    snap.forEach(d => { sum += d.data().rating || 0; count++; });
                    await db.collection('products').doc(productId).update({
                        ratingAvg: count ? Math.round((sum / count) * 10) / 10 : 0,
                        ratingCount: count
                    });
                    this.showToast('Review deleted');
                    this.loadAdminReviews();
                    this.loadHomeReviews();
                } catch (err) {
                    console.error('Delete review error', err);
                    this.showToast('Failed to delete review');
                }
            },

            adminCategories: ['All', 'Smart Watch', 'Automatic Watch', "Men's Watch", "Women's Watch", 'Powerbank', 'Neckband', 'Earbuds', 'Headphones', 'Speakers'],

            setAdminCategory(cat) {
                this.adminCategoryFilter = cat;
                this.renderAdminList();
            },

            setAdminCategoryByIndex(idx) {
                this.adminCategoryFilter = this.adminCategories[idx] || 'All';
                this.renderAdminList();
            },

            renderAdminList() {
                const list = document.getElementById('admin-product-list');
                const filterWrap = document.getElementById('admin-category-filters');

                // Category filter buttons
                if (filterWrap) {
                    filterWrap.innerHTML = this.adminCategories.map((cat, idx) => {
                        const isActive = this.adminCategoryFilter === cat;
                        const count = cat === 'All'
                            ? this.allProducts.length
                            : this.allProducts.filter(p => p.category === cat).length;
                        return `
                            <button onclick="app.setAdminCategoryByIndex(${idx})"
                                class="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all
                                ${isActive
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700'}">
                                ${cat} <span class="opacity-70">(${count})</span>
                            </button>`;
                    }).join('');
                }

                if (!this.allProducts.length) {
                    list.innerHTML = '<p class="text-gray-500 text-center py-6">No products yet. Click "Add Product".</p>';
                    return;
                }

                // Filter by selected category (keep real index for edit/delete)
                const filtered = this.allProducts
                    .map((p, i) => ({ p, i }))
                    .filter(({ p }) => this.adminCategoryFilter === 'All' || p.category === this.adminCategoryFilter);

                if (filtered.length === 0) {
                    list.innerHTML = `<p class="text-gray-500 text-center py-6">No products in "${this.adminCategoryFilter}".</p>`;
                    return;
                }

                list.innerHTML = filtered.map(({ p, i }) => `
                    <div class="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4">
                        <img src="${p.image || (p.images && p.images[0]) || ''}" class="w-16 h-16 object-cover rounded-lg flex-shrink-0" onerror="this.src='https://via.placeholder.com/64'">
                        <div class="flex-1 min-w-0">
                            <h4 class="font-semibold text-gray-900 truncate">${p.name}</h4>
                            <p class="text-sm text-gray-500">${p.category} • ₹${p.price} <span class="line-through text-gray-400">₹${p.original}</span>
                                ${p.cod === false ? '<span class="text-red-500 text-xs ml-1">❌ No COD</span>' : '<span class="text-green-600 text-xs ml-1">💵 COD</span>'}
                            </p>
                        </div>
                        <div class="flex gap-2 flex-shrink-0">
                            <button onclick="app.editProduct(${i})" class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="app.deleteProduct(${i})" class="w-9 h-9 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            },

            keptImages: [], // existing (already-uploaded) image URLs kept while editing
            keptVideo: null,

            showAddProductForm() {
                this.editingIndex = -1;
                this.keptImages = [];
                this.keptVideo = null;
                document.getElementById('form-title').textContent = 'Add New Product';
                document.getElementById('f-name').value = '';
                document.getElementById('f-category').value = 'Smart Watch';
                document.getElementById('f-price').value = '';
                document.getElementById('f-original').value = '';
                document.getElementById('f-cod-yes').checked = true;
                document.getElementById('f-cod-no').checked = false;
                document.getElementById('f-cod-charge').value = '0';
                document.getElementById('f-photo-files').value = '';
                document.getElementById('f-video-file').value = '';
                document.getElementById('f-existing-images').innerHTML = '';
                document.getElementById('f-existing-video').innerHTML = '';
                document.getElementById('f-desc').value = '';
                document.getElementById('f-edit-index').value = '-1';
                document.getElementById('f-doc-id').value = '';
                document.getElementById('admin-form').classList.remove('hidden');
            },

            editProduct(index) {
                const p = this.allProducts[index];
                this.editingIndex = index;
                document.getElementById('form-title').textContent = 'Edit Product';
                document.getElementById('f-name').value = p.name || '';
                document.getElementById('f-category').value = p.category || 'Smart Watch';
                document.getElementById('f-price').value = p.price || '';
                document.getElementById('f-original').value = p.original || '';
                if (p.cod === false) {
                    document.getElementById('f-cod-no').checked = true;
                    document.getElementById('f-cod-yes').checked = false;
                } else {
                    document.getElementById('f-cod-yes').checked = true;
                    document.getElementById('f-cod-no').checked = false;
                }
                document.getElementById('f-cod-charge').value = p.codCharge || 0;
                document.getElementById('f-photo-files').value = '';
                document.getElementById('f-video-file').value = '';
                document.getElementById('f-desc').value = p.desc || '';
                document.getElementById('f-edit-index').value = index;
                document.getElementById('f-doc-id').value = p.id || '';

                // Show existing images with remove (x) buttons
                this.keptImages = (p.images && p.images.length ? p.images : (p.image ? [p.image] : [])).slice();
                this.renderKeptImages();

                this.keptVideo = p.video || null;
                this.renderKeptVideo();

                document.getElementById('admin-form').classList.remove('hidden');
            },

            renderKeptImages() {
                const box = document.getElementById('f-existing-images');
                box.innerHTML = this.keptImages.map((src, i) => `
                    <div class="relative">
                        <img src="${src}" class="w-16 h-16 object-cover rounded-lg border">
                        <button type="button" onclick="app.removeKeptImage(${i})" class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                    </div>
                `).join('');
            },

            removeKeptImage(i) {
                this.keptImages.splice(i, 1);
                this.renderKeptImages();
            },

            renderKeptVideo() {
                const box = document.getElementById('f-existing-video');
                if (this.keptVideo) {
                    box.innerHTML = `Current video: ${this.keptVideo.split('/').pop().slice(0, 30)}... <button type="button" onclick="app.removeKeptVideo()" class="text-red-500 ml-2">✕ Remove</button>`;
                } else {
                    box.innerHTML = '';
                }
            },

            removeKeptVideo() {
                this.keptVideo = null;
                this.renderKeptVideo();
            },

            hideAdminForm() {
                document.getElementById('admin-form').classList.add('hidden');
            },

            uploadFile(file, resourceType) {
                // Uploads directly to Cloudinary (free, no card, no server needed)
                return new Promise((resolve, reject) => {
                    const CLOUD_NAME = 'hmurvbsu';
                    const UPLOAD_PRESET = 'Ramnad_Gedgets';
                    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('upload_preset', UPLOAD_PRESET);

                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', url, true);

                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const pct = Math.round((e.loaded / e.total) * 100);
                            document.getElementById('f-upload-bar').style.width = pct + '%';
                            document.getElementById('f-upload-text').textContent = `Uploading ${file.name}... ${pct}%`;
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            const res = JSON.parse(xhr.responseText);
                            resolve(res.secure_url);
                        } else {
                            reject(new Error('Cloudinary upload failed: ' + xhr.responseText));
                        }
                    };
                    xhr.onerror = () => reject(new Error('Network error during upload'));
                    xhr.send(formData);
                });
            },

            async saveProduct() {
                if (typeof db === 'undefined') {
                    this.showToast('Cloud not connected. Check Firebase setup.');
                    return;
                }

                const name = document.getElementById('f-name').value.trim();
                const category = document.getElementById('f-category').value;
                const price = parseInt(document.getElementById('f-price').value) || 0;
                const original = parseInt(document.getElementById('f-original').value) || price;
                const desc = document.getElementById('f-desc').value.trim();
                const photoFiles = Array.from(document.getElementById('f-photo-files').files);
                const videoFile = document.getElementById('f-video-file').files[0];

                if (!name || !price) {
                    this.showToast('Name and Price required');
                    return;
                }
                if (this.keptImages.length === 0 && photoFiles.length === 0) {
                    this.showToast('At least one photo needed');
                    return;
                }

                const saveBtn = document.getElementById('f-save-btn');
                saveBtn.disabled = true;
                saveBtn.textContent = 'Uploading...';
                document.getElementById('f-upload-progress').classList.remove('hidden');

                try {
                    // Upload new photos to Cloudinary
                    let images = this.keptImages.slice();
                    for (const file of photoFiles) {
                        const url = await this.uploadFile(file, 'image');
                        images.push(url);
                    }

                    // Upload video if selected
                    let video = this.keptVideo;
                    if (videoFile) {
                        video = await this.uploadFile(videoFile, 'video');
                    }

                    const cod = document.getElementById('f-cod-yes').checked;
                    const codCharge = cod ? (parseInt(document.getElementById('f-cod-charge').value) || 0) : 0;

                    const product = {
                        name, category, desc, price, original,
                        cod: cod,
                        codCharge: codCharge,
                        image: images[0],
                        images: images,
                        video: video || null,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    const docId = document.getElementById('f-doc-id').value;
                    if (docId) {
                        await db.collection('products').doc(docId).update(product);
                        this.showToast('Product updated - everyone will see it now');
                    } else {
                        await db.collection('products').add(product);
                        this.showToast('Product added - live for everyone now');
                    }

                    this.hideAdminForm();
                } catch (err) {
                    console.error(err);
                    this.showToast('Upload failed: ' + err.message);
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                    document.getElementById('f-upload-progress').classList.add('hidden');
                    document.getElementById('f-upload-bar').style.width = '0%';
                }
            },

            async deleteProduct(index) {
                if (!confirm('Delete this product?')) return;
                const p = this.allProducts[index];
                try {
                    await db.collection('products').doc(p.id).delete();
                    this.showToast('Deleted permanently - gone for everyone, forever');
                } catch (err) {
                    this.showToast('Delete failed: ' + err.message);
                }
            },

            

            saveToLocalStorage() {
                localStorage.setItem('ramnad_products', JSON.stringify(this.products));
            },

            loadFromLocalStorage() {
                const saved = localStorage.getItem('ramnad_products');
                if (saved) {
                    try {
                        return JSON.parse(saved);
                    } catch(e) {}
                }
                return null;
            },

            downloadJSON() {
                const dataStr = JSON.stringify(this.products, null, 2);
                const blob = new Blob([dataStr], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'all.json';
                a.click();
                URL.revokeObjectURL(url);
                this.showToast('all.json downloaded — replace in data/ folder');
            },

            resetToOriginal() {
                if (!confirm('Reset all changes and load original products?')) return;
                localStorage.removeItem('ramnad_products');
                location.reload();
            },

            goHome() {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this.filterCategory('all');
            },

            scrollToProducts() {
                document.getElementById('products-section').scrollIntoView({ behavior: 'smooth' });
            }
        };

        document.addEventListener('DOMContentLoaded', () => app.init());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { 
                app.closeModal(); 
                app.closeProductModal(); 
                app.closeCheckout(); 
                app.closeAdmin();
            }
            // Secret: Ctrl + Shift + A to open Admin
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                app.openAdmin();
            }
        });