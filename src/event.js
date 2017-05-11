import {SimpleMap, isNullOrUndefined, createObject, doc as document} from './utils';

const ALL_PROPS = [
    "altKey", "bubbles", "cancelable", "ctrlKey",
    "eventPhase", "metaKey", "relatedTarget", "shiftKey",
    "target", "timeStamp", "type", "view", "which"
];
const KEY_PROPS = ["char", "charCode", "key", "keyCode"];
const MOUSE_PROPS = [
    "button", "buttons", "clientX", "clientY", "layerX",
    "layerY", "offsetX", "offsetY", "pageX", "pageY",
    "screenX", "screenY", "toElement"
];

const rkeyEvent = /^key|input/;
const rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/;

function Event(e) {
    for (let i = 0; i < ALL_PROPS.length; i++) {
        let propKey = ALL_PROPS[i];
        this[propKey] = e[propKey];
    }

    this._rawEvent = e;
}
Event.prototype.preventDefault = function() {
    this._rawEvent.preventDefault();
};
Event.prototype.stopPropagation = function() {
    const e = this._rawEvent;    
    e.cancelBubble = true;
    e.stopImmediatePropagation();
};

function MouseEvent(e) {
    Event.call(this, e);
    for (let j = 0; j < MOUSE_PROPS.length; j++) {
        let mousePropKey = MOUSE_PROPS[j];
        this[mousePropKey] = e[mousePropKey];
    }
}
MouseEvent.prototype = createObject(Event.prototype);
MouseEvent.prototype.constructor = MouseEvent;

function KeyEvent(e) {
    Event.call(this, e);
    for (let j = 0; j < KEY_PROPS.length; j++) {
        let keyPropKey = KEY_PROPS[j];
        this[keyPropKey] = e[keyPropKey];
    }
}
KeyEvent.prototype = createObject(Event.prototype);
KeyEvent.prototype.constructor = KeyEvent;

function proxyEvent(e) {
    if (rkeyEvent.test(e.type)) {
        return new KeyEvent(e);
    } else if (rmouseEvent.test(e.type)) {
        return new MouseEvent(e);
    } else {
        return new Event(e);
    }
}

const delegatedEvents = {};

export function handleEvent(name, lastEvent, nextEvent, dom) {
    let delegatedRoots = delegatedEvents[name];

    if (nextEvent) {
        if (!delegatedRoots) {
            delegatedRoots = {items: new SimpleMap(), docEvent: null};
            delegatedRoots.docEvent = attachEventToDocument(name, delegatedRoots); 
            delegatedEvents[name] = delegatedRoots;
        }
        delegatedRoots.items.set(dom, nextEvent);
    } else if (delegatedRoots) {
        const items = delegatedRoots.items;
        if (items.delete(dom)) {
            if (items.size === 0) {
                document.removeEventListener(name, delegatedRoots.docEvent);
                delete delegatedRoots[name];
            }
        }
    }
}

function dispatchEvent(event, target, items, count, isClick) {
    const eventToTrigger = items.get(target);
    if (eventToTrigger) {
        count--;
        event.currentTarget = target;
        eventToTrigger(event);
        if (event._rawEvent.cancelBubble) {
            return;
        }
    }
    if (count > 0) {
        const parentDom = target.parentNode;
        if (isNullOrUndefined(parentDom) || (isClick && parentDom.nodeType === 1 && parentDom.disabled)) {
            return;
        }
        dispatchEvent(event, parentDom, items, count, isClick);
    }
}

function attachEventToDocument(name, delegatedRoots) {
    var docEvent = function(event) {
        const count = delegatedRoots.items.size;
        if (count > 0) {
            dispatchEvent(proxyEvent(event), event.target, delegatedRoots.items, count, event.type === 'click'); 
        }
    };
    document.addEventListener(name, docEvent);
    return docEvent;
}