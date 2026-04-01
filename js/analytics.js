const Analytics = {
  track(event, props) {
    try {
      if (typeof umami !== 'undefined' && typeof umami.track === 'function') {
        umami.track(event, props);
      }
    } catch (e) {
      // Analytics should never break app functionality
    }
  }
};
