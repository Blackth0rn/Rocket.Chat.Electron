import { EventEmitter } from 'events';
import { remote } from 'electron';
import { servers } from './servers';
import { webview } from './webview';
import { menuTemplate } from './menus';

var Menu = remote.Menu;

var windowMenuPosition = menuTemplate.findIndex(function(i) {return i.id === 'window';});
var windowMenu = menuTemplate[windowMenuPosition];
var serverListSeparatorPosition = windowMenu.submenu.findIndex(function(i) {return i.id === 'server-list-separator';});
var serverListSeparator = windowMenu.submenu[serverListSeparatorPosition];

class SideBar extends EventEmitter {
	constructor() {
		super();

		this.hostCount = 0;
		let sortOrder = localStorage.getItem(this.sortOrderKey);

		try {
			this._sortOrder = JSON.parse( sortOrder );
		} catch(e) {
			this._sortOrder = [];
		}

		this.listElement = document.getElementById('serverList');

		servers.forEach((host) => {
			this.add(host);
		});

		localStorage.setItem(this.sortOrderKey, JSON.stringify( this._sortOrder) );

		servers.on('host-added', (hostUrl) => {
			this.add(servers.get(hostUrl));
		});

		servers.on('host-removed', (hostUrl) => {
			this.remove(hostUrl);
		});

		servers.on('active-setted', (hostUrl) => {
			this.setActive(hostUrl);
		});

		servers.on('active-cleared', (hostUrl) => {
			this.deactiveAll(hostUrl);
		});

		servers.on('title-setted', (hostUrl, title) => {
			this.setLabel(hostUrl, title);
		});

		webview.on('dom-ready', (hostUrl) => {
			this.setImage(hostUrl);
		});

		if (this.isHidden()) {
			this.hide();
		} else {
			this.show();
		}
	}

	get sortOrderKey() {
		return 'rocket.chat.sortOrder';
	}

	add(host) {
		var name = host.title.replace(/^https?:\/\/(?:www\.)?([^\/]+)(.*)/, '$1');
		name = name.split('.');
		name = name[0][0] + (name[1] ? name[1][0] : '');
		name = name.toUpperCase();

		var initials = document.createElement('span');
		initials.innerHTML = name;

		var tooltip = document.createElement('div');
		tooltip.classList.add('tooltip');
		tooltip.innerHTML = host.title;

		var badge = document.createElement('div');
		badge.classList.add('badge');

		var img = document.createElement('img');
		img.onload = function() {
			img.style.display = 'initial';
			initials.style.display = 'none';
		};
		// img.src = `${host.url}/assets/favicon.svg?v=${Math.round(Math.random()*10000)}`;

		// if the sortOrder is set, use it, other wise use the length of the sortOrder array and add to the end of it
		var sortOrder = 0;
		if( this._sortOrder.includes( host.url ) ) {
			sortOrder = this._sortOrder.indexOf(host.url);
		} else {
			sortOrder = this._sortOrder.length;
			this._sortOrder.push( host.url );
		}

		var hotkey = document.createElement('div');
		hotkey.classList.add('name');
		if (process.platform === 'darwin') {
			hotkey.innerHTML = '⌘' + (sortOrder);
		} else {
			hotkey.innerHTML = '^' + (sortOrder);
		}

		var item = document.createElement('li');
		item.appendChild(initials);
		item.appendChild(tooltip);
		item.appendChild(badge);
		item.appendChild(img);
		item.appendChild(hotkey);

		item.dataset.host = host.url;
		item.dataset.sortOrder = sortOrder;
		item.setAttribute('server', host.url);
		item.classList.add('instance');

		//Drag'n'Drop
		item.setAttribute('draggable', true);
		item.ondragstart = (ev) => {
			ev.dataTransfer.effectAllowed = 'move';
			ev.dataTransfer.dropEffect = 'move';
			ev.dataTransfer.setData("text/plain", host.url);
		};

		item.ondragenter = (ev) => {
			let url = ev.dataTransfer.getData('text/plain')
			let source = this.getByUrl( url );
			if( this.isBefore( source, ev.target ) ) {
				ev.currentTarget.parentNode.insertBefore( source, ev.currentTarget );
			} else if ( ev.currentTarget !== ev.currentTarget.parentNode.lastChild ) {
				ev.currentTarget.parentNode.insertBefore( source, ev.currentTarget.nextSibling );
			} else {
				ev.currentTarget.parentNode.appendChild( source );
			}

		};

		// Once we're done dragging save the updated order
		item.ondragend = (ev) => {
			let newSortOrder = [];
			let newSubMenu = [];
			let children = ev.currentTarget.parentNode.children;
			for( let sortOrder = 0; sortOrder < children.length; sortOrder++ ) {
				let url = children[sortOrder].dataset.host;
				newSortOrder.push( url  );
				// Re-do hotkey visual hints
				let hotkey = children[sortOrder].querySelector('div.name');
				if (process.platform === 'darwin') {
					hotkey.innerHTML = '⌘' + (sortOrder);
				} else {
					hotkey.innerHTML = '^' + (sortOrder);
				}
				// rebuild menu
				newSubMenu.push( {
					label: children[sortOrder].querySelector('div.tooltip').innerHTML,
					accelerator: 'CmdOrCtrl+' + sortOrder,
					position: 'before=server-list-separator',
					id: url,
					click: () => {
						var mainWindow = remote.getCurrentWindow();
						mainWindow.show();
						this.emit('click', url);
						servers.setActive(url);
					}
				} );
			}
			this._sortOrder = newSortOrder;
			windowMenu.submenu = newSubMenu;
			Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
			localStorage.setItem(this.sortOrderKey, JSON.stringify( this._sortOrder) );
		};

		item.onclick = () => {
			this.emit('click', host.url);
			servers.setActive(host.url);
		};

		let child = this.listElement.firstElementChild;
		if( child === null || this.listElement.lastElementChild.dataset.sortOrder < sortOrder ) {
			this.listElement.appendChild(item);
		}
		else {
			while( child.dataset.sortOrder < sortOrder ) {
				child = child.nextElementSibling;
			}
			this.listElement.insertBefore( item, child );
		}

		serverListSeparator.visible = true;

		var menuItem = {
			label: host.title,
			accelerator: 'CmdOrCtrl+' + sortOrder,
			position: 'before=server-list-separator',
			id: host.url,
			click: () => {
				var mainWindow = remote.getCurrentWindow();
				mainWindow.show();
				this.emit('click', host.url);
				servers.setActive(host.url);
			}
		};

		windowMenu.submenu.push(menuItem);
		Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
	}

	setImage(hostUrl) {
		const img = this.getByUrl(hostUrl).querySelector('img');
		img.src = `${hostUrl}/assets/favicon.svg?v=${Math.round(Math.random()*10000)}`;
	}

	remove(hostUrl) {
		var el = this.getByUrl(hostUrl);
		if (el) {
			el.remove();

			var index = windowMenu.submenu.findIndex(function(i) {return i.id === hostUrl;});
			windowMenu.submenu.splice(index, 1);
			Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
		}
	}

	getByUrl(hostUrl) {
		return this.listElement.querySelector(`.instance[server="${hostUrl}"]`);
	}

	getActive() {
		return this.listElement.querySelector('.instance.active');
	}

	isActive(hostUrl) {
		return !!this.listElement.querySelector(`.instance.active[server="${hostUrl}"]`);
	}

	setActive(hostUrl) {
		if (this.isActive(hostUrl)) {
			return;
		}

		this.deactiveAll();
		var item = this.getByUrl(hostUrl);
		if (item) {
			item.classList.add('active');
		}
	}

	deactiveAll() {
		var item;
		while (!(item = this.getActive()) === false) {
			item.classList.remove('active');
		}
	}

	setLabel(hostUrl, label) {
		this.listElement.querySelector(`.instance[server="${hostUrl}"] .tooltip`).innerHTML = label;
	}

	setBadge(hostUrl, badge) {
		var item = this.getByUrl(hostUrl);
		var badgeEl = item.querySelector('.badge');

		if (badge !== null && badge !== undefined && badge !== '') {
			item.classList.add('unread');
			if (isNaN(parseInt(badge))) {
				badgeEl.innerHTML = '';
			} else {
				badgeEl.innerHTML = badge;
			}
		} else {
			badge = undefined;
			item.classList.remove('unread');
			badgeEl.innerHTML = '';
		}
		this.emit('badge-setted', hostUrl, badge);
	}

	getGlobalBadge() {
		var count = 0;
		var alert = '';
		var instanceEls = this.listElement.querySelectorAll('li.instance');
		for (var i = instanceEls.length - 1; i >= 0; i--) {
			var instanceEl = instanceEls[i];
			var text = instanceEl.querySelector('.badge').innerHTML;
			if (!isNaN(parseInt(text))) {
				count += parseInt(text);
			}

			if (alert === '' && instanceEl.classList.contains('unread') === true) {
				alert = '•';
			}
		}

		if (count > 0) {
			return String(count);
		} else {
			return alert;
		}
	}

	hide() {
		document.body.classList.add('hide-server-list');
		localStorage.setItem('sidebar-closed', 'true');
		this.emit('hide');
	}

	show() {
		document.body.classList.remove('hide-server-list');
		localStorage.setItem('sidebar-closed', 'false');
		this.emit('show');
	}

	toggle() {
		if (this.isHidden()) {
			this.show();
		} else {
			this.hide();
		}
	}

	isHidden() {
		return localStorage.getItem('sidebar-closed') === 'true';
	}

	isBefore(a, b) {
		if(a.parentNode == b.parentNode) {
			for( let cur = a; cur; cur = cur.previousSibling ) {
				if( cur === b ) {
					return true;
				}
			}
		}
		return false;
	}
}

export var sidebar = new SideBar();


var selectedInstance = null;
var instanceMenu = remote.Menu.buildFromTemplate([{
	label: 'Reload server',
	click: function() {
		webview.getByUrl(selectedInstance.dataset.host).reload();
	}
}, {
	label: 'Remove server',
	click: function() {
		servers.removeHost(selectedInstance.dataset.host);
	}
}, {
	label: 'Open DevTools',
	click: function() {
		webview.getByUrl(selectedInstance.dataset.host).openDevTools();
	}
}]);

window.addEventListener('contextmenu', function(e) {
	if (e.target.classList.contains('instance') || e.target.parentNode.classList.contains('instance')) {
		e.preventDefault();
		if (e.target.classList.contains('instance')) {
			selectedInstance = e.target;
		} else {
			selectedInstance = e.target.parentNode;
		}

		instanceMenu.popup(remote.getCurrentWindow());
	}
}, false);
