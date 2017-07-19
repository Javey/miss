import {Types, createTextVNode, EMPTY_OBJ} from './vnode';
import {patchProp} from './vpatch';
import {handleEvent} from './event';
import {
    MountedQueue, isArray, isStringOrNumber,
    isNullOrUndefined, isEventProp, doc as document,
    setTextContent
} from './utils';
import {processForm} from './wrappers/process';

export function render(vNode, parentDom, mountedQueue, parentVNode) {
    if (isNullOrUndefined(vNode)) return;
    let isTrigger = true;
    if (mountedQueue) {
        isTrigger = false;
    } else {
        mountedQueue = new MountedQueue();
    }
    const dom = createElement(vNode, parentDom, mountedQueue, true /* isRender */, parentVNode);
    if (isTrigger) {
        mountedQueue.trigger();
    }
    return dom;
}

export function createElement(vNode, parentDom, mountedQueue, isRender, parentVNode) {
    const type = vNode.type;
    if (type & Types.Element) {
        return createHtmlElement(vNode, parentDom, mountedQueue, isRender, parentVNode);
    } else if (type & Types.Text) {
        return createTextElement(vNode, parentDom);
    } else if (type & Types.ComponentClassOrInstance) {
        return createComponentClassOrInstance(vNode, parentDom, mountedQueue, null, isRender, parentVNode);
    // } else if (type & Types.ComponentFunction) {
        // return createComponentFunction(vNode, parentDom, mountedQueue, isNotAppendChild, isRender);
    // } else if (type & Types.ComponentInstance) {
        // return createComponentInstance(vNode, parentDom, mountedQueue);
    } else if (type & Types.HtmlComment) {
        return createCommentElement(vNode, parentDom);
    } else {
        throw new Error(`unknown vnode type ${type}`);
    }
}

export function createHtmlElement(vNode, parentDom, mountedQueue, isRender, parentVNode) {
    const dom = document.createElement(vNode.tag);
    const children = vNode.children;
    const props = vNode.props;
    const className = vNode.className;

    vNode.dom = dom;
    vNode.parentVNode = parentVNode;

    if (!isNullOrUndefined(children)) {
        createElements(children, dom, mountedQueue, isRender, vNode);
    }

    if (!isNullOrUndefined(className)) {
        dom.className = className;
    }

    if (props !== EMPTY_OBJ) {
        const isFormElement = (vNode.type & Types.FormElement) > 0;
        for (let prop in props) {
            patchProp(prop, null, props[prop], dom, isFormElement);
        }
        if (isFormElement) {
            processForm(vNode, dom, props, true);
        }
    }

    const ref = vNode.ref;
    if (!isNullOrUndefined(ref)) {
        createRef(dom, ref, mountedQueue);
    }

    if (parentDom) {
        appendChild(parentDom, dom);
    }

    return dom;
}

export function createTextElement(vNode, parentDom) {
    const dom = document.createTextNode(vNode.children);
    vNode.dom = dom;

    if (parentDom) {
        parentDom.appendChild(dom);
    }

    return dom;
}

export function createComponentClassOrInstance(vNode, parentDom, mountedQueue, lastVNode, isRender, parentVNode) {
    const props = vNode.props;
    const instance = vNode.type & Types.ComponentClass ?
        new vNode.tag(props) : vNode.children;
    instance.parentDom = parentDom;
    instance.mountedQueue = mountedQueue;
    instance.isRender = isRender;
    instance.parentVNode = parentVNode;
    const dom = instance.init(lastVNode, vNode);
    const ref = vNode.ref;

    vNode.dom = dom;
    vNode.children = instance;

    if (parentDom) {
        appendChild(parentDom, dom);
        // parentDom.appendChild(dom);
    }

    if (typeof instance.mount === 'function') {
        mountedQueue.push(() => instance.mount(lastVNode, vNode));
    }

    if (typeof ref === 'function') {
        ref(instance);
    }

    return dom;
}

export function createComponentFunction(vNode, parentDom, mountedQueue) {
    const props = vNode.props;
    const ref = vNode.ref;

    createComponentFunctionVNode(vNode);

    let children = vNode.children;
    let dom;
    // support ComponentFunction return an array for macro usage
    if (isArray(children)) {
        dom = [];
        for (let i = 0; i < children.length; i++) {
            dom.push(createElement(children[i], parentDom, mountedQueue));
        }
    } else {
        dom = createElement(vNode.children, parentDom, mountedQueue);
    }
    vNode.dom = dom;

    // if (parentDom) {
        // parentDom.appendChild(dom);
    // }

    if (ref) {
        createRef(dom, ref, mountedQueue);
    }

    return dom;
}

export function createCommentElement(vNode, parentDom) {
    const dom = document.createComment(vNode.children);
    vNode.dom = dom;

    if (parentDom) {
        parentDom.appendChild(dom);
    }

    return dom;
}

export function createComponentFunctionVNode(vNode) {
    let result = vNode.tag(vNode.props);
    if (isStringOrNumber(result)) {
        result = createTextVNode(result);
    } else if (process.env.NODE_ENV !== 'production') {
        if (isArray(result)) {
            throw new Error(`ComponentFunction ${vNode.tag.name} returned a invalid vNode`);
        }
    }

    vNode.children = result;

    return vNode;
}

export function createElements(vNodes, parentDom, mountedQueue, isRender, parentVNode) {
    if (isStringOrNumber(vNodes)) {
        setTextContent(parentDom, vNodes);
    } else if (isArray(vNodes)) {
        for (let i = 0; i < vNodes.length; i++) {
            createElement(vNodes[i], parentDom, mountedQueue, isRender, parentVNode);
        }
    } else {
        createElement(vNodes, parentDom, mountedQueue, isRender, parentVNode);
    }
}

export function removeElements(vNodes, parentDom) {
    if (isNullOrUndefined(vNodes)) {
        return;
    } else if (isArray(vNodes)) {
        for (let i = 0; i < vNodes.length; i++) {
            removeElement(vNodes[i], parentDom);
        }
    } else {
        removeElement(vNodes, parentDom);
    }
}

export function removeElement(vNode, parentDom) {
    const type = vNode.type;
    if (type & Types.Element) {
        return removeHtmlElement(vNode, parentDom);
    } else if (type & Types.TextElement) {
        return removeText(vNode, parentDom);
    } else if (type & Types.ComponentClassOrInstance) {
        return removeComponentClassOrInstance(vNode, parentDom);
    } else if (type & Types.ComponentFunction) {
        return removeComponentFunction(vNode, parentDom);
    }
}

export function removeHtmlElement(vNode, parentDom) {
    const ref = vNode.ref;
    const props = vNode.props;
    const dom = vNode.dom;

    if (ref) {
        ref(null);
    }

    removeElements(vNode.children, null);

    // remove event
    for (let name in props) {
        const prop = props[name];
        if (!isNullOrUndefined(prop) && isEventProp(name)) {
            handleEvent(name.substr(0, 3), prop, null, dom);
        }
    }

    if (parentDom) {
        parentDom.removeChild(dom);
    }
}

export function removeText(vNode, parentDom) {
    if (parentDom) {
        parentDom.removeChild(vNode.dom);
    }
}

export function removeComponentFunction(vNode, parentDom) {
    const ref = vNode.ref;
    if (ref) {
        ref(null);
    }
    removeElement(vNode.children, parentDom);
}

export function removeComponentClassOrInstance(vNode, parentDom, nextVNode) {
    const instance = vNode.children;
    const ref = vNode.ref;

    if (typeof instance.destroy === 'function') {
        instance.destroy(vNode, nextVNode, parentDom);
    }

    if (ref) {
        ref(null);
    }

    // instance destroy method will remove everything
    // removeElements(vNode.props.children, null);

    if (parentDom) {
        // if (typeof instance.unmount === 'function') {
            // if (!instance.unmount(vNode, nextVNode, parentDom)) {
                // parentDom.removeChild(vNode.dom); 
            // }
        // } else {
            // parentDom.removeChild(vNode.dom); 
            removeChild(parentDom, vNode);
        // }
        // parentDom.removeChild(vNode.dom);
    }
}

export function removeAllChildren(dom, vNodes) {
    // setTextContent(dom, '');
    // removeElements(vNodes);
}

export function replaceChild(parentDom, lastVNode, nextVNode) {
    const lastDom = lastVNode.dom;
    const nextDom = nextVNode.dom;
    if (!parentDom) parentDom = lastDom.parentNode;
    if (lastDom._unmount) {
        lastDom._unmount(lastVNode, parentDom);
        if (!nextDom.parentNode) {
            parentDom.appendChild(nextDom);
        }
    } else {
        parentDom.replaceChild(nextDom, lastDom);
    }
}

export function removeChild(parentDom, vNode) {
    const dom = vNode.dom;
    if (dom._unmount) {
        dom._unmount(vNode, parentDom);
    } else {
        parentDom.removeChild(dom);
    }
}

export function appendChild(parentDom, dom) {
    // for animation the dom will not be moved
    // if (!dom.parentNode) {
        parentDom.appendChild(dom);
    // }
}

export function createRef(dom, ref, mountedQueue) {
    if (typeof ref === 'function') {
        mountedQueue.push(() => ref(dom));
    } else {
        throw new Error(`ref must be a function, but got "${JSON.stringify(ref)}"`);
    }
}
