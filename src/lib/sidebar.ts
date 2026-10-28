export const SIDEBAR_STORAGE_KEY = "chef-harena:sidebar";

/** The admin sidebar is full width unless it was collapsed to an icon rail. */
export const SIDEBAR_COLLAPSED = "collapsed";

/**
 * Runs synchronously in <head> before first paint: a stored "collapsed" sets
 * data-sidebar on <html>, so the sidebar renders at its chosen width without a
 * jump (CSS reads it through the `sidebar-collapsed:` variant).
 */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)})===${JSON.stringify(SIDEBAR_COLLAPSED)}){document.documentElement.setAttribute("data-sidebar",${JSON.stringify(
  SIDEBAR_COLLAPSED,
)})}}catch(e){}})();`;
