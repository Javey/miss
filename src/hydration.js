import {Types, EMPTY_OBJ} from './vnode';
import {createElement, createRef,
    createTextElement, createCommentElement
} from './vdom';
import {isNullOrUndefined, setTextContent,
    isStringOrNumber, isArray, MountedQueue
} from './utils';
import {patchProp} from './vpatch';
import {processForm} from './wrappers/process';

export function hydrateRoot(vNode, parentDom, mountedQueue) {
    if (!isNullOrUndefined(parentDom)) {
        let dom = parentDom.firstChild;
        let newDom = hydrate(vNode, dom, mountedQueue, parentDom, null);
        dom = parentDom.firstChild;
        if (dom !== null) {
            // should only one entry
            while (dom = dom.nextSibling) {
                parentDom.removeChild(dom);
            }
        }
        return newDom;
    }
    return null;
}

export function hydrate(vNode, dom, mountedQueue, parentDom, parentVNode) {
    if (dom !== null) {
        let isTrigger = true;
        if (mountedQueue) {
            isTrigger = false;
        } else {
            mountedQueue = new MountedQueue();
        }
        dom = hydrateElement(vNode, dom, mountedQueue, parentDom, parentVNode);
        if (isTrigger) {
            mountedQueue.trigger();
        }
    }
    return dom;
}

export function hydrateElement(vNode, dom, mountedQueue, parentDom, parentVNode) {
    const type = vNode.type;
    
    if (type & Types.Element) {
        return hydrateHtmlElement(vNode, dom, mountedQueue, parentDom, parentVNode);
    } else if (type & Types.Text) {
        return hydrateText(vNode, dom);
    } else if (type & Types.HtmlComment) {
        return hydrateComment(vNode, dom);
    } else if (type & Types.ComponentClassOrInstance) {
        return hydrateComponentClassOrInstance(vNode, dom, mountedQueue, parentDom, parentVNode);
    }
}

function hydrateComponentClassOrInstance(vNode, dom, mountedQueue, parentDom, parentVNode) {
    const props = vNode.props;
    const instance = vNode.type & Types.ComponentClass ?
        new vNode.tag(props) : vNode.children;
    instance.parentDom = parentDom;
    instance.mountedQueue = mountedQueue;
    instance.isRender = true;
    instance.parentVNode = parentVNode;
    let newDom = instance.hydrate(vNode, dom);

    vNode.dom = newDom;
    vNode.children = instance;

    if (typeof instance.mount === 'function') {
        mountedQueue.push(() => instance.mount(null, vNode));
    }

    const ref = vNode.ref;
    if (typeof ref === 'function') {
        ref(instance);
    }

    if (dom !== newDom && dom.parentNode) {
        dom.parentNode.replaceChild(newDom, dom);
    }

    return dom;
}

function hydrateComment(vNode, dom) {
    if (dom.nodeType !== 8) {
        const newDom = createCommentElement(vNode, null);
        dom.parentNode.replaceChild(newDom, dom);
        return newDom;
    }
    const comment = vNode.children;
    if (dom.data !== comment) {
        dom.data = comment;
    }
    vNode.dom = dom;
    return dom;
}

function hydrateText(vNode, dom) {
    if (dom.nodeType !== 3) {
        const newDom = createTextElement(vNode, null);
        dom.parentNode.replaceChild(newDom, dom);

        return newDom;
    }

    const text = vNode.children;
    if (dom.nodeValue !== text) {
        dom.nodeValue = text;
    }
    vNode.dom = dom;

    return dom;
}

function hydrateHtmlElement(vNode, dom, mountedQueue, parentDom, parentVNode) {
    const children = vNode.children;
    const props = vNode.props;
    const className = vNode.className;
    const type = vNode.type;
    const ref = vNode.ref;

    vNode.parentVNode = parentVNode;

    if (dom.nodeType !== 1 || dom.tagName.toLowerCase() !== vNode.tag) {
        warning('Server-side markup doesn\'t match client-side markup');
        const newDom = createElement(vNode, null, mountedQueue, parentDom, parentVNode);
        dom.parentNode.replaceChild(newDom, dom);

        return newDom;
    }

    vNode.dom = dom;
    if (!isNullOrUndefined(children)) {
        hydrateChildren(children, dom, mountedQueue, vNode);
    } else if (dom.firstChild !== null) {
        setTextContent(dom, '');
    }

    if (props !== EMPTY_OBJ) {
        const isFormElement = (type & Types.FormElement) > 0;
        for (let prop in props) {
            patchProp(prop, null, props[prop], dom, isFormElement);
        }
        if (isFormElement) {
            processForm(vNode, dom, props, true);
        }
    }

    if (!isNullOrUndefined(className)) {
        dom.className = className;
    } else if (dom.className !== '') {
        dom.removeAttribute('class');
    }

    if (ref) {
        createRef(dom, ref, mountedQueue);
    }

    return dom;
}

function hydrateChildren(children, parentDom, mountedQueue, parentVNode) {
    normalizeChildren(parentDom);
    let dom = parentDom.firstChild;

    if (isStringOrNumber(children)) {
        if (dom !== null && dom.nodeType === 3) {
            if (dom.nodeValue !== children) {
                dom.nodeValue = children;
            }
        } else if (children === '') {
            parentDom.appendChild(document.createTextNode(''));
        } else {
            setTextContent(parentDom, children);
        }
        if (dom !== null) {
            dom = dom.nextSibling;
        }
    } else if (isArray(children)) {
        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            if (!isNullOrUndefined(child)) {
                if (dom !== null) {
                    const nextSibling = dom.nextSibling;
                    hydrateElement(child, dom, mountedQueue, parentDom, parentVNode);
                    dom = nextSibling;
                } else {
                    createElement(child, parentDom, mountedQueue, true, parentVNode);
                }
            }
        }
    } else {
        if (dom !== null) {
            hydrateElement(children, dom, mountedQueue, parentDom, parentVNode);
        } else {
            createElement(children, parentDom, mountedQueue, true, parentVNode);
        }
    }

    // clear any other DOM nodes, there should be on a single entry for the root
    // while (dom) {
        // const nextSibling = dom.nextSibling;
        // parentDom.removeChild(dom);
        // dom = nextSibling;
    // }
}

function normalizeChildren(parentDom) {
    let dom = parentDom.firstChild;

    while (dom) {
        if (dom.nodeType === 8 && dom.data === '') {
            const lastDom = dom.previousSibling;
            parentDom.removeChild(dom);
            dom = lastDom || parentDom.firstChild;
        } else {
            dom = dom.nextSibling;
        }
    }
}

const warning = typeof console === 'object' ? function(message) {
    console.warn(message);
} : function() {};