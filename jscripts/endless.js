/**
 * Endless beta 1 © Shade 2012-2018
 *
 * Thanks to https://github.com/flarum/core for inspiration, both on visual and code side
 **/
(function() {

	$.fn.afterTransition = function(callback) {
		return this.each(function() {
			var $this = $(this);
			$this.bind("animationend webkitAnimationEnd oAnimationEnd MSAnimationEnd transitionend webkitTransitionEAnind oTransitionEnd MSTransitionEnd", function() {
				if (typeof callback == 'function') {
					callback.call(this); // brings the scope to the callback
				};
			});
		})

	};

	var $document = $(document);
	Endless = {

		visibleItems: {},
		itemsCache: [],
		itemsInDOM: [],
		range: {},
		safeMargin: 300,
		loadIds: [],
		mode: '',
		pagesLoading: 0,
		loadPageTimeouts: {},
		class: {
			scrolledItem: 'endless-new-item',
				placeholder: 'endless-placeholder'
		},
		timeouts: {},

		init: function(options) {

			// Set the options
			Endless.options = $.extend({
				cid: 0,
				lastNode: 0,
				custom: false,
				automaticDetection: true,
				enableScrubber: false,
				itemsLoadedPerPage: 10,
				itemsShownPerPage: 10,
				page: 1,
			}, options);

			if (!Endless.options.cid || !Endless.options.lastNode) {
				return false;
			}

			// Reset the scrolling position to the top (we're going to scroll to the correct item later)
			$(window).on('unload', function() {
				$(window).scrollTop(0);
			});

			window.onunload = function() {
				window.scrollTo(0, 0);
			};

			if ('scrollRestoration' in history) {
				history.scrollRestoration = 'manual';
			}

			Endless.paused = false;

			// Set the mode
			Endless.mode = $('.post').length ? 'posts' : 'threads';

			// Do some resetting
			Endless.itemsCache.length = 0;
			Endless.itemsInDOM.length = 0;
			Endless.visibleItems = {};
			Endless.scrollListener.active = false;

			var items = (Endless.mode == 'posts') ? $('.post') : $('.thread');

			Endless.options.page--;

			var i = 1;

			// Load the visible items into the virtual DOM tree
			items.each(function() {

				var item = $(this);
				var number = parseInt(Endless.options.page * Endless.options.itemsShownPerPage + i);

				if (isNaN(number)) {
					return;
				}

				item.attr('data-node-number', number);

				i++;

				// Unreliable method to get the initial id, works for demo
				var identifier = item.hasClass('post') ? item.attr('id').slice(5) : item.find('[id*="tid_"]').attr('id').slice(4);

				return Endless.saveItemInCache(number, item, identifier);

			});

			Endless.cache.normalize();

			// Throttle the max items per page to 30
			Endless.itemsLoadedPerPage = Math.min(30, Endless.itemsLoadedPerPage);

			// Remove any pagination from the URL
			history.replaceState(null, '', Endless.removeUrlParameter(window.location.href, 'page'));

			// Calculate the currently on screen items
			Endless.range.calculateCurrent();

			// Calculate the currently visible items
			Endless.calculateVisibleItems();

			// Scroll to the anchored item, if any's available
			var pid = Endless.getUrlParameter('pid');

			if (pid) {

				var item = $('#post_' + pid);

				if (item.length) {

					// Scroll to the anchored item
					$.when(
						Endless.scrollHandler.toItem(item)
					).then(() => {

						// If this isn't the first item, and the first of this page is still visible, load the previous page
						if (Endless.range.first != 1 && (Endless.visibleItems.first - 1) % Endless.options.itemsLoadedPerPage == 0) {
							Endless.loadPrevious();
						}

					});

				}

			} else if (Endless.range.first != 1) {
				Endless.loadPrevious();
			}

			// New posts
			if (typeof Thread !== 'undefined') {

				var originalQuickReplyDone = Thread.quickReplyDone;
				var registerItemLoop = {};

				Thread.quickReplyDone = function(request, status) {

					var json = $.parseJSON(request.responseText);

					if (json.hasOwnProperty('errors')) {
						return false;
					}

					Endless.options.lastNode++;

					$('.Scrubber-count').text(Endless.options.lastNode);

					var item = '';

					// Wait till the item has been loaded into DOM and save it to cache
					registerItemLoop[Endless.options.lastNode] = setInterval(function(num) {

						item = $('[data-node-number="' + (num - 1) + '"] ~ [id*="post_"]');

						if (item.length == 0) {
							return false;
						}

						Endless.saveItemInCache(num, item.attr('data-node-number', num), item.attr('id').slice(5));

						clearInterval(registerItemLoop[num]);

					}, 200, Endless.options.lastNode);

					return originalQuickReplyDone.call(this, request, status);

				}

			}

			// Begin listening to the scroll event
			if (Endless.options.automaticDetection) {

				Endless.scrollListener.start(Endless.onScroll);

				if (Endless.options.enableScrubber) {

					// Add the scrubber
					Endless.scrubber.show();

					// Set up the events for the scrubber
					$(window).on('resize', Endless.scrubber.onResize.bind(this)).resize();

					$('.Scrubber-scrollbar')
						.bind('click', Endless.scrubber.onClick.bind(this))
						.css({
							cursor: 'pointer',
							'user-select': 'none'
						})
						.bind('dragstart mousedown touchstart', e => e.preventDefault());

					$('.Scrubber-handle')
						.css('cursor', 'move')
						.bind('mousedown touchstart', Endless.scrubber.onMouseDown.bind(this))
						.click(e => e.stopPropagation());

					$('.Scrubber-first')
						.bind('click', Endless.scrubber.goToFirst.bind(this));

					$('.Scrubber-last')
						.bind('click', Endless.scrubber.goToLast.bind(this));

					$('.Dropdown-toggle')
						.bind('click', Endless.scrubber.toggleDropdown.bind(this));

					$document
						.on('mousemove touchmove', Endless.scrubber.onMouseMove.bind(this))
						.on('mouseup touchend', Endless.scrubber.onMouseUp.bind(this));

				}

			} else {

				// Manual load
				$('body').on('click', '.loadNextPage, .loadPrevPage', function() {

					var backwards = $(this).hasClass('loadNextPage') ? false : true;

					if (backwards) {
						Endless.loadPrevious();
					} else {
						Endless.loadNext();
					}

				});

			}

		},

		updateLocation: function() {

			var index = Endless.scrubber.index;
			var count = Endless.range.countTotalItems();
			// Current number of visible items in sight, as percentage relative to the total count
			var visible = Endless.scrubber.visible || 1;

			var minCheck = Math.min(index, count - visible);
			var currentItem = (minCheck == 1) ? 1 : Math.ceil(index + visible);

			currentItem = Endless.sanitizeIndex(currentItem);

			var url;

			if (Endless.mode == 'posts') {

				try {
					var pid = Endless.itemsCache[currentItem].id;
				} catch (e) {
					return false;
				}

				url = Endless.replaceUrlParameter(window.location.href, 'pid', pid) + '#pid' + pid;

			} else {

				// Calculate the page we are currently on and update the counter
				var page = Math.floor(currentItem / Endless.options.itemsShownPerPage + 1);

				if (page) {
					url = Endless.replaceUrlParameter(window.location.href, 'page', page);
				}

			}

			return history.replaceState(null, '', url);

		},

		replaceUrlParameter: function(url, paramName, paramValue) {

			if (paramValue == null) {
				paramValue = '';
			}

			var pattern = new RegExp('(' + paramName + '=).*?(&|$)');

			if (url.search(pattern) >= 0) {
				return url.replace(pattern, '$1' + paramValue + '$2');
			}

			return url + (url.indexOf('?') > 0 ? '&' : '?') + paramName + '=' + paramValue;

		},

		removeUrlParameter: function(url, parameter) {

			var urlParts = url.split('?');

			if (urlParts.length >= 2) {

				// Get first part, and remove from array
				var urlBase = urlParts.shift();

				// Join it back up
				var queryString = urlParts.join('?');

				var prefix = encodeURIComponent(parameter) + '=';
				var parts = queryString.split(/[&;]/g);

				// Reverse iteration as may be destructive
				for (var i = parts.length; i-- > 0;) {
					// Idiom for string.startsWith
					if (parts[i].lastIndexOf(prefix, 0) !== -1) {
						parts.splice(i, 1);
					}
				}

				if (!parts.length) {
					url = urlBase;
				} else {
					url = urlBase + '?' + parts.join('&');
				}

			}

			return url;

		},

		getUrlParameter: function(sParam) {
			var sPageURL = decodeURIComponent(window.location.search.substring(1)),
				sURLVariables = sPageURL.split('&'),
				sParameterName,
				i;

			for (i = 0; i < sURLVariables.length; i++) {
				sParameterName = sURLVariables[i].split('=');

				if (sParameterName[0] === sParam) {
					return sParameterName[1] === undefined ? true : sParameterName[1];
				}
			}
		},

		/**
		 * Event fired to listen to user's scrolling
		 **/
		onScroll: function() {

			if (Endless.paused) return;

			Endless.calculateVisibleItems();

			var currentItem = Endless.scrubber.renderScrollbar(true);

			Endless.delayExecution('updateUrl', Endless.updateLocation);

			// Every time we stop scrolling, recalculate the current in-DOM items
			Endless.delayExecution('normalizeCache', Endless.cache.normalize, 1000);

			var scrollTop = Endless.scrollListener.currentTop;
			var backwards = (scrollTop < Endless.scrollListener.lastTop);

			var firstNode = $('[data-node-number="' + Endless.range.first + '"]');
			var lastNode = $('[data-node-number="' + Endless.range.last + '"]');
			var windowHeight = $(window).height();
			var boundaries = {};

			if (firstNode.length) {
				boundaries.top = firstNode.offset().top + Endless.safeMargin;
			}

			if (lastNode.length) {
				boundaries.bottom = lastNode.offset().top - windowHeight - Endless.safeMargin;
			}

			// Load placeholders
			if ((backwards && scrollTop < boundaries.top) ||
				(!backwards && scrollTop > boundaries.bottom)) {

				// Add placeholders and load the page
				if (backwards) {
					Endless.loadPrevious();
				} else {
					Endless.loadNext();
				}

			}

		},

		redraw: function() {

			var no = Math.floor((Math.random() * 10) + 1);

			var deferred = $.Deferred();

			var addToDOM = [];
			var removeFromDOM = [];
			var visibleItems = $('[data-node-number]');
			var closest = 0;
			var newItemsIdentifiers = [];
			var template = '';
			var currentItems = this.itemsInDOM.slice();
			var currentFirst = this.range.first;
			var currentLast = this.range.last;

			if (Endless.mode == 'posts') {
				template = $(Endless.templates.post);
			} else {

				var colspan = Number($('[data-node-number]:not(.' + Endless.class.placeholder + '):first > td').length);

				template = $(Endless.templates.thread.replace(/\{colspan\}/g, colspan));

			}

			var index = 0;

			// Figure out the missing items by looping from start to end
			for (var v = currentFirst; v <= currentLast; v++) {

				var loadPlaceholder = !Endless.exists(Endless.itemsCache[v]);

				// If this item does not exist, load a placeholder
				var content = !loadPlaceholder ? Endless.itemsCache[v].content : template.clone().attr('data-node-number', v).addClass(Endless.class.placeholder);

				var existingItem = $('[data-node-number="' + v + '"]');

				// Missing from the DOM
				if (!existingItem.length) {

					// This is not a placeholder, register it into the virtual DOM
					if (!loadPlaceholder) {
						Endless.saveToCurrentListOfItems(v);
					}

					addToDOM.push({
						'content': content,
						'id': v
					});

					// Build a list of placeholders + items from cache that'll be added
					// on which we need to call the MyBB functions updater. Every item that'll be added to the DOM
					// will pass through the MyBB functions reloader
					newItemsIdentifiers.push(v);

				}
				// This item is already in place!
				else {

					// Build a list of in-DOM items
					if (currentItems.indexOf(v) == -1) {
						currentItems.push(v);
					}

					// This is a placeholder AND the content has been loaded in cache: replace
					if (existingItem.hasClass(Endless.class.placeholder) && !loadPlaceholder) {

						existingItem.replaceWith(content);

						newItemsIdentifiers.push(v);

					}

				}

			}

			// Add content
			if (addToDOM.length) {

				$.each(addToDOM, function(k, v) {

					var number = v.id;

					// Check what's the closest node in the DOM
					var closest = Endless.getClosestIdentifier(number, currentItems);
					var node = $('[data-node-number="' + closest + '"]');

					// Abort if not found
					if (!node.length) {
						return;
					}

					if (number < closest) {
						node.before(v.content);
					} else if (number > closest) {
						node.after(v.content);
					}

					currentItems.push(number);

				});

				Endless.updateMyBBFunctions(newItemsIdentifiers);

			}

			// Figure out the items to remove
			$.each(visibleItems, function(k, v) {

				var number = parseInt($(this).attr('data-node-number'));

				if ((number < currentFirst || number > currentLast) &&
					!$('[data-node-number="' + number + '"]').hasClass('protected')) {

					removeFromDOM.push('[data-node-number="' + number + '"]');

					// Remove <a> anchors for posts
					index = Endless.itemsInDOM.indexOf(number);

					if (index > -1) {

						if (Endless.mode == 'posts' && Endless.itemsCache[number]) {
							removeFromDOM.push('#pid' + Endless.itemsCache[number].id);
						}

						// Remove from the virtual DOM
						Endless.itemsInDOM.splice(index, 1);

					}

				}

			});

			// Remove items if there are some to remove
			if (removeFromDOM.length) {
				$(removeFromDOM.join()).remove();
			}

			Endless.cache.normalize();

			return deferred.resolve().promise();

		},

		updateMyBBFunctions: function(identifiers) {

			if (!identifiers.length) {
				return false;
			}

			$.each(identifiers, function(k, number) {

				var item = Endless.itemsCache[number];
				var id, pid;

				if (!Endless.exists(item)) {
					return false;
				}

				if (Endless.mode == 'posts') {

					var pid = item.id;
					var id = 'post_' + pid;

				}

				var target = $('[data-node-number="' + number + '"]');

				if (id) {
					target.attr('id', id);
				}

				// Load the quickEdit functions if this is a post
				if (pid && typeof Thread !== 'undefined') {
					Thread.quickEdit("#pid_" + pid);
				}

			});

			if (typeof inlineModeration !== "undefined") { // Guests don't have this object defined
				$('[data-node-number] [id*="inlinemod_"]').on('change', inlineModeration.checkItem);
			}

		},

		saveToCurrentListOfItems: function(number) {

			number = parseInt(number);

			var index = Endless.itemsInDOM.indexOf(number);

			if (index == -1) {
				return Endless.itemsInDOM.push(number);
			}

			return false;

		},

		saveItemInCache: function(number, item, identifier) {

			number = parseInt(number);

			if (isNaN(number)) {
				return false;
			}

			Endless.saveToCurrentListOfItems(number);

			var postsMode = item.hasClass('post');
			var content = $("<div />").append(item.clone()).contents();

			Endless.itemsCache[number] = {
				'content': content.removeClass(Endless.class.scrolledItem)
			};

			if (identifier) {
				Endless.itemsCache[number].id = parseInt(identifier);
			}

			return Endless.itemsCache[number];

		},

		removeFromTree: function(number) {

			number = parseInt(number);

			var index = Endless.itemsInDOM.indexOf(number);

			if (index > -1) {

				Endless.itemsCache.splice(number, 1);
				Endless.itemsInDOM.splice(index, 1);

			}

			return true;

		},

		loadPrevious: function() {

			var end = this.range.first - 1;
			var start = this.sanitizeIndex(end - this.options.itemsLoadedPerPage + 1);

			this.range.setFirst(start);

			var twoPagesAway = start + this.options.itemsLoadedPerPage * 2;
			if (this.automaticDetection && twoPagesAway < this.range.last && twoPagesAway <= this.options.lastNode) {

				this.range.setLast(twoPagesAway);

				if (this.loadPageTimeouts[twoPagesAway]) {

					clearTimeout(Endless.loadPageTimeouts[twoPagesAway]);
					this.loadPageTimeouts[twoPagesAway] = null;
					this.pagesLoading--;

				}

			}

			return this.loadPage(start, end, true);

		},

		loadNext: function() {

			var start = this.range.last + 1;
			var end = this.sanitizeIndex(start + this.options.itemsLoadedPerPage - 1);

			this.range.setLast(end);

			var twoPagesAway = start - this.options.itemsLoadedPerPage * 2;
			if (this.automaticDetection && twoPagesAway > this.range.first && twoPagesAway >= 0) {

				this.range.setFirst(twoPagesAway + this.options.itemsLoadedPerPage);

				if (this.loadPageTimeouts[twoPagesAway]) {

					clearTimeout(this.loadPageTimeouts[twoPagesAway]);
					this.loadPageTimeouts[twoPagesAway] = null;
					this.pagesLoading--;

				}

			}

			return this.loadPage(start, end);

		},

		loadNearNumber: function(number) {

			var start = Endless.sanitizeIndex(number - this.options.itemsLoadedPerPage / 2);
			var end = start + this.options.itemsLoadedPerPage;

			this.range.reset(start, end);

			this.paused = true;

			return this.redraw().then(() => {
				this.ajax.requestRange(start, end).then(() => {
					this.scrollHandler.toNumber(number).done(() => {
						Endless.unpause()
					})
				})
			});

		},

		loadPage: function(start, end, backwards) {

			var deferred = $.Deferred();

			// Stop if posts/threads are finished
			if (start < Endless.range.first || end > Endless.range.last || start > end) return deferred.resolve().promise();

			var anchor = backwards ? '[data-node-number="' + Endless.range.last + '"]' : '[data-node-number="' + Endless.range.first + '"]';

			// Load the placeholders into the real DOM
			Endless.anchorScroll(anchor, () => Endless.redraw());

			$document.trigger('endless:afterPlaceholdersLoad');

			Endless.loadPageTimeouts[start] = setTimeout(() => {

				$.when(Endless.ajax.requestRange(start, end, backwards)).then(() => {
					Endless.pagesLoading--;
				});

				Endless.loadPageTimeouts[start] = null;

			}, Endless.pagesLoading ? 1000 : 0);

			Endless.pagesLoading++;

		},

		sanitizeIndex: function(index) {
			return Math.max(1, Math.min(Endless.options.lastNode, index));
		},

		getMarginTop: function() {

			Endless.marginTop = (Endless.marginTop) ? Endless.marginTop : $('#header').outerHeight(true);

			return Endless.marginTop;

		},

		/**
		 * Calculate the currently visible elements
		 *
		 **/
		calculateVisibleItems: function() {

			var marginTop = Endless.getMarginTop();
			var scrollTop = Endless.scrollListener.currentTop + marginTop;
			var windowHeight = $(window).height() - marginTop;
			var first = 0;
			var last = 0;
			var visible = 0;
			var top = 0;
			var time = 0;
			var index = 0;
			var visible = 0;

			$('[data-node-number]').each(function() {

				var item = $(this);
				var offset = item.offset().top;
				var height = item.outerHeight(true);

				// This item's bottom border is above the current scrolling position, skip
				if (offset + height < scrollTop) {
					return true;
				}

				// This item's bottom border is farther than the current scrolling position
				if (offset + height > scrollTop) {

					if (!first) {
						first = last = item.attr('data-node-number');
					}

					// This item's bottom border is still visible
					if (offset + height < scrollTop + windowHeight)  {
						last = item.attr('data-node-number');
					}

					if (offset > scrollTop + windowHeight) {
						return false;
					}

				}

				var visibleTop = Math.max(0, scrollTop - offset);
				var visibleBottom = Math.min(height, scrollTop + windowHeight - offset);
				var visibleItem = visibleBottom - visibleTop;

				if (offset <= scrollTop || index == 0) {
					index = parseFloat(item.attr('data-node-number') - 1) + visibleTop / height;
				}

				if (visibleItem > 0) {
					visible += visibleItem / height;
				}

				time = item.attr('data-time');

			});

			// Set up index, visible and description for the scrubber
			Endless.scrubber.index = index;
			Endless.scrubber.visible = visible;

			if (time)  {

				var period = new Date(parseInt(time) * 1000);

				Endless.scrubber.description = Endless.lang.months[period.getMonth()] + ' ' + period.getUTCFullYear();

			}

			// Set up the visible boundaries
			Endless.visibleItems.first = parseInt(first);
			Endless.visibleItems.last = parseInt(last);

			return Endless.visibleItems;

		},

		range: {

			first: 0,
			last: 0,

			setFirst: function(number) {
				return Endless.range.first = Number(number);
			},

			setLast: function(number) {
				return Endless.range.last = Number(number);
			},

			countCurrentItems: function() {
				return Endless.itemsInDOM.length;
			},

			countTotalItems: function() {
				return Endless.options.lastNode;
			},

			calculateCurrent: function() {

				var temporary = Endless.itemsInDOM.slice();

				// Sort first-to-last
				temporary.sort(function(a, b) {
					return a - b
				});

				Endless.range.setFirst(temporary.length ? temporary[0] : 1);
				Endless.range.setLast(temporary[temporary.length - 1]);

			},

			reset: function(start, end) {

				Endless.range.setFirst(start || 1);
				Endless.range.setLast(Endless.sanitizeIndex(end || Endless.options.itemsLoadedPerPage));

				return Endless.range;

			}

		},

		cache: {

			normalize: function() {

				Endless.itemsInDOM.length = 0;

				// Let's sync the actual items in DOM with the cached value
				$('[data-node-number]').each((index, element) => {
					Endless.itemsInDOM.push($(element).attr('data-node-number'));
				});

				Endless.itemsInDOM.sort(function(a, b) {
					return a - b;
				});

				return Endless.range.calculateCurrent();

			}

		},

		scrubber: {

			index: 0,
			visible: 0,
			description: '',
			dragging: false,
			mouseStart: 0,
			indexStart: 0,
			lastItem: 0,

			show: function() {

				var template = $(Endless.templates.scrubber.replace(/\{totalItems\}/g, Endless.range.countTotalItems()));

				if (!$('.PostStreamScrubber').length) {
					$('body').append(template);
				}

				Endless.scrubber.renderScrollbar();

			},

			onClick: function(e) {

				try {

					// Calculate the index which we want to jump to based on the click position.

					// 1. Get the offset of the click from the top of the scrollbar, as a
					//    percentage of the scrollbar's height. jQuery offset() is unreliable in Chrome 60+,
					//    so we use vanilla js to obtain the current position of the scrubber
					var $scrollbar = $('.Scrubber-scrollbar');
					var offsetPixels = (e.clientY || e.originalEvent.touches[0].clientY) - $scrollbar[0].getBoundingClientRect().top + $('body').scrollTop();
					var offsetPercent = offsetPixels / $scrollbar.outerHeight(true) * 100;

					// 2. We want the handle of the scrollbar to end up centered on the click
					//    position. Thus, we calculate the height of the handle in percent and
					//    use that to find a new offset percentage.
					offsetPercent = offsetPercent - parseFloat($scrollbar.find('.Scrubber-handle')[0].style.height) / 2;

					// 3. Now we can convert the percentage into an index, and tell the stream-
					//    content component to jump to that index.
					var offsetIndex = offsetPercent / Endless.scrubber.percentPerItem().index;
					offsetIndex = Math.max(0, Math.min(Endless.range.countTotalItems() - 1, offsetIndex));
					var visible = Endless.scrubber.visible;
					var minCheck = Math.min(offsetIndex, Endless.range.countTotalItems() - visible);
					var intIndex = (minCheck == 1) ? 1 : Math.ceil(offsetIndex + visible);

					Endless.loadNearNumber(intIndex);
					Endless.scrubber.index = offsetIndex;
					Endless.scrubber.renderScrollbar(true);

					Endless.scrubber.closeDropdown();

				} catch (e) {
					// Continue
					console.log(e);
				}

			},

			onResize: function(e) {

				Endless.scrollListener.update(true);

				// Adjust the height of the scrollbar so that it fills the height of
				// the sidebar and doesn't overlap the footer.
				var scrubber = $('.PostStreamScrubber');
				var scrollbar = $('.Scrubber-scrollbar');

				scrollbar.css('max-height', $(window).height() - scrubber.offset().top + $(window).scrollTop() - (scrubber.outerHeight() - scrollbar.outerHeight()) - 30);

			},

			onMouseDown: function(e) {

				Endless.paused = true;

				Endless.scrubber.mouseStart = e.clientY || e.originalEvent.touches[0].clientY;
				Endless.scrubber.indexStart = Endless.scrubber.index;
				Endless.scrubber.dragging = true;
				$('body').css('cursor', 'move');

			},

			onMouseMove: function(e) {

				if (!Endless.scrubber.dragging) return;

				// Work out how much the mouse has moved by - first in pixels, then
				// convert it to a percentage of the scrollbar's height, and then
				// finally convert it into an index. Add this delta index onto
				// the index at which the drag was started, and then scroll there.
				try {

					var deltaPixels = (e.clientY || e.originalEvent.touches[0].clientY) - Endless.scrubber.mouseStart;
					var deltaPercent = deltaPixels / $('.Scrubber-scrollbar').outerHeight() * 100;
					var deltaIndex = (deltaPercent / Endless.scrubber.percentPerItem().index) || 0;

					Endless.scrubber.index = Endless.sanitizeIndex(Endless.scrubber.indexStart + deltaIndex);
					Endless.scrubber.renderScrollbar();

				} catch (e) {
					// e.originalEvent.touches might be undefined, but that's not of our business...
				}

			},

			onMouseUp: function(e) {

				if (!Endless.scrubber.dragging) return;

				Endless.scrubber.mouseStart = 0;
				Endless.scrubber.indexStart = 0;
				Endless.scrubber.dragging = false;
				$('body').css('cursor', '');

				Endless.scrubber.closeDropdown();

				// If the index we've landed on is in a gap, then tell the stream-
				// content that we want to load those posts.
				var index = Endless.scrubber.index;
				var visible = Endless.scrubber.visible;
				var minCheck = Math.min(index, Endless.range.countTotalItems() - visible);
				var intIndex = (minCheck == 1) ? 1 : Math.ceil(index + visible);

				Endless.loadNearNumber(intIndex);
				Endless.scrubber.renderScrollbar(true);

			},

			goToFirst: function() {
				Endless.loadNearNumber(0);
				Endless.scrubber.index = 0;
				Endless.scrubber.renderScrollbar(true);
				Endless.scrubber.closeDropdown();
			},

			goToLast: function() {
				Endless.loadNearNumber(Endless.range.countTotalItems());
				Endless.scrubber.index = Endless.range.countTotalItems();
				Endless.scrubber.renderScrollbar(true);
				Endless.scrubber.closeDropdown();
			},

			toggleDropdown: function() {
				return $('.PostStreamScrubber').toggleClass('open');
			},

			closeDropdown: function() {
				return $('.PostStreamScrubber').removeClass('open');
			},

			renderScrollbar: function(animate) {

				// Disable if the automatic detection of scrolling is off
				if (!Endless.options.automaticDetection || !Endless.options.enableScrubber) return;

				var scrubber = $('.PostStreamScrubber');

				// No scrubber? Wait until it's properly loaded
				if (!scrubber.length) {
					return Endless.delayExecution('renderScrollbar', Endless.scrubber.renderScrollbar);
				}

				var percentPerItem = Endless.scrubber.percentPerItem();
				var index = Endless.scrubber.index;
				var count = Endless.range.countTotalItems();
				// Current number of visible items in sight, as percentage relative to the total count
				var visible = Endless.scrubber.visible || 1;

				var minCheck = Math.min(index, count - visible);
				var itemNumber = (minCheck == 1) ? 1 : Math.ceil(index + visible);

				itemNumber = Endless.sanitizeIndex(itemNumber);

				if (itemNumber != Endless.scrubber.lastItem) {

					scrubber.find('.Scrubber-index').text(itemNumber);
					scrubber.find('.Scrubber-description').text(Endless.scrubber.description);
					scrubber.toggleClass('disabled', Endless.scrubber.disabled());

					Endless.scrubber.lastItem = itemNumber;

				}

				var heights = {};
				heights.before = Math.max(0, percentPerItem.index * minCheck);

				if (heights.before == percentPerItem.index) {
					heights.before = 0;
				}

				heights.handle = Math.min(100 - heights.before, percentPerItem.visible * visible);
				heights.after = 100 - heights.before - heights.handle;

				var func = animate ? 'animate' : 'css';

				for (var key in heights) {

					var $key = scrubber.find('.Scrubber-' + key).stop(true, true)[func]({
						'height': heights[key] + '%'
					}, 'fast');

					// jQuery likes to put overflow:hidden, but because the scrollbar handle has a negative margin-left, we need to override.
					if (func === 'animate') {
						$key.css('overflow', 'visible');
					}
				}

				return itemNumber;

			},

			disabled: function() {
				return Endless.scrubber.visible >= Endless.range.countTotalItems();
			},

			percentPerItem: function() {

				var count = Endless.range.countTotalItems() || 1;
				var visible = Endless.scrubber.visible || 1;

				var minPercentVisible = 50 / $('.Scrubber-scrollbar').outerHeight() * 100;
				var percentPerVisibleItem = Math.max(100 / count, minPercentVisible / visible);
				var percentPerItem = count === visible ? 0 : (100 - percentPerVisibleItem * visible) / (count - visible);

				return {
					index: percentPerItem,
					visible: percentPerVisibleItem
				}

			}

		},

		scrollHandler: {

			toNumber: function(number, noAnimation, bottom) {

				number = Endless.sanitizeIndex(number);

				var item = $('[data-node-number="' + parseInt(number) + '"]');

				return Endless.scrollHandler.toItem(item, noAnimation, true);

			},

			toItem: function(item, noAnimation, force) {

				var container = $('html, body').stop(true);

				if (item.length) {

					var windowHeight = $(window).height();
					var itemOffset = item.offset();
					var itemTop = itemOffset.top - Endless.getMarginTop();
					var itemBottom = itemOffset.top + item.outerHeight();
					var scrollTop = $(document).scrollTop();
					var scrollBottom = scrollTop + windowHeight;

					// If the item is already in the viewport, we may not need to scroll.
					// If we're scrolling to the bottom of an item, then we'll make sure the
					// bottom will line up with the top of the composer.
					if (force || itemTop < scrollTop || itemBottom > scrollBottom) {

						var top = itemBottom - windowHeight;

						// If this item's height is higher than the viewport height, we need to adjust
						// the top to point towards the top of this item
						if (itemBottom - itemTop > windowHeight) {
							top = itemTop;
						}

						if (noAnimation) {
							container.scrollTop(top);
						} else if (top !== scrollTop) {
							container.animate({
								scrollTop: top
							}, 'fast');
						}

					}

					item.addClass(Endless.class.scrolledItem);

					Endless.delayExecution('removeScrolledItemClass', () => {
						$('[data-node-number]').removeClass(Endless.class.scrolledItem)
					}, 1200);

				}

				return container.promise();

			}

		},

		scrollListener: {

			requestAnimationFrame: window.requestAnimationFrame ||
				window.webkitRequestAnimationFrame ||
				window.mozRequestAnimationFrame ||
				window.msRequestAnimationFrame ||
				window.oRequestAnimationFrame,

			active: false,
			lastTop: -1,
			currentTop: -1,

			setCallback: function(callback) {
				Endless.scrollListener.callback = callback;
			},

			loop: function() {

				if (!Endless.scrollListener.active) {
					return false;
				}

				Endless.scrollListener.update();

				Endless.scrollListener.requestAnimationFrame.call(window, Endless.scrollListener.loop);

			},

			update: function(force) {

				Endless.scrollListener.currentTop = window.pageYOffset;

				if (Endless.scrollListener.lastTop !== Endless.scrollListener.currentTop || force) {

					Endless.scrollListener.callback(Endless.scrollListener.currentTop);

					Endless.scrollListener.lastTop = Endless.scrollListener.currentTop;

				}

			},

			start: function(callback) {

				if (!Endless.scrollListener.active) {

					Endless.scrollListener.setCallback(callback);
					Endless.scrollListener.active = true;
					Endless.scrollListener.lastTop = -1;
					Endless.scrollListener.loop();

				}

			},

			stop: function() {
				Endless.scrollListener.active = false;
			}

		},

		unpause: function() {
			Endless.paused = false;
			Endless.scrollListener.update(true);
			Endless.scrubber.renderScrollbar(true);
		},

		ajax: {

			request: function(data) {

				data.infinite = 1;
				data.cid = Endless.options.cid;
				data.action = Endless.mode;

				if (Endless.options.custom) {
					data.custom = Endless.options.custom;
				}

				return $.ajax({
					type: 'GET',
					url: 'xmlhttp.php',
					data: data
				});

			},

			requestRange: function(start, end, backwards) {

				var deferred = $.Deferred();

				// Reset the loadIds array
				Endless.loadIds.length = 0;

				start = Endless.sanitizeIndex(start);
				end = Endless.sanitizeIndex(end);

				// Figure out the missing items by looping from start to end
				for (var v = start; v <= end; v++) {

					if (!Endless.exists(Endless.itemsCache[v])) {
						Endless.loadIds.push(v);
					}

				}

				if (!Endless.loadIds.length) return deferred.resolve().promise();

				// Request the new items
				return $.when(

					Endless.ajax.request({
						range: Endless.loadIds.join()
					})

				).then(function(d, t, response) {

					var items = $.parseJSON(response.responseText);
					var anchor = backwards ? '[data-node-number="' + Endless.range.last + '"]' : '[data-node-number="' + Endless.range.first + '"]';

					// Replace the placeholders with the new items
					Endless.anchorScroll(anchor, () => {

						var lastNode = 0;
						var newItemsIdentifiers = [];

						if (typeof items === 'object') {

							$.each(items, function(k, v)  {

								Endless.saveItemInCache(k, $('<div />').append(v.content).find('.post:first, .thread:first').attr('data-node-number', k).end().contents(), v.id);

								lastNode = k;

							});

						}

						// Fire the event
						$document.trigger('endless:afterPageLoad');

						Endless.redraw();

						// If there are still placeholders around (eg.: lastNode mismatch or not defined), delete them
						// and lock further requests. Ensure lastNode is less than expected, otherwise if multiple pages
						// are pending this function might delete pages before they actually load
						var placeholders = $('.endless-placeholder');

						if (lastNode < end && placeholders.length) {

							$.each(placeholders, function(k, v) {

								Endless.removeFromTree($(this).attr('data-node-number'));

								return $(this).remove();

							});

							// Set the lastNode to the real one and recalculate the range
							Endless.options.lastNode = Number(lastNode);
							Endless.range.calculateCurrent();

							// Remove buttons
							if (backwards) {
								$('.loadPrevPage').remove();
							} else {
								$('.loadNextPage').remove();
							}

						}

					});

					return deferred.resolve().promise();

				});

			}

		},

		/**
		 * Function wrapper to retain an object's position in sight
		 *
		 * Normally, content added above a DOM object shift the view to another object,
		 * since the DOM does not update the scrolling position automatically. Wrapping a function that
		 * changes the content inside the anchorScroll prevents this as it updates the scrolling position
		 * accordingly.
		 *
		 * Thanks to Flarum https://github.com/flarum/core/blob/master/js/lib/utils/anchorScroll.js
		 *
		 **/
		anchorScroll: function(element, callback) {

			if (!$(element).length) {
				element = '[data-node-number]:first';
			}

			var $window = $(window);
			var relativeScroll = $(element).offset().top - $window.scrollTop();

			callback();

			if (!$(element).length) {
				element = '[data-node-number]:first';
			}

			return $window.scrollTop($(element).offset().top - relativeScroll);

		},

		getClosestIdentifier: function(num, arr) {

			arr = arr.slice();

			arr.sort(function(a, b) {
				return a - b;
			});

			var mid;
			var lo = 0;
			var hi = arr.length - 1;

			while (hi - lo > 1) {

				mid = Math.floor((lo + hi) / 2);

				if (arr[mid] < num) {
					lo = mid;
				} else {
					hi = mid;
				}

			}

			if (num - arr[lo] <= arr[hi] - num) {
				return Number(arr[lo]);
			}

			return Number(arr[hi]);

		},

		generateRandomInteger: function(min, max) {
			return Math.floor(Math.random() * (max - min + 1)) + min;
		},

		exists: function(variable) {

			return (typeof variable !== 'undefined' && variable != null && variable) ?
				true :
				false;

		},

		delayExecution: function(id, func, interval) {

			if (!interval) {
				interval = 200;
			}

			try {
				clearTimeout(Endless.timeouts[id]);
				Endless.timeouts[id] = setTimeout(() => {
					func()
				}, interval);
			} catch (e) {
				// Endless.timeouts[id] undefined
			}

		}

	}

})();