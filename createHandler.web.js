import Hammer from 'hammerjs';
import React from 'react';
import {
  findNodeHandle,
  InteractionManager,
  PanResponder,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import Directions from './Directions';
import State from './State';

function distance(touchTrackA, touchTrackB, ofCurrent) {
  let xa, ya, xb, yb;
  if (ofCurrent) {
    xa = touchTrackA.currentPageX;
    ya = touchTrackA.currentPageY;
    xb = touchTrackB.currentPageX;
    yb = touchTrackB.currentPageY;
  } else {
    xa = touchTrackA.previousPageX;
    ya = touchTrackA.previousPageY;
    xb = touchTrackB.previousPageX;
    yb = touchTrackB.previousPageY;
  }
  return Math.sqrt(Math.pow(xa - xb, 2) + Math.pow(ya - yb, 2));
}

function maxDistance(touchBank, ofCurrent) {
  let max = 0;
  for (let i = 0; i < touchBank.length - 1; i++) {
    for (let j = i + 1; j < touchBank.length; j++) {
      let d = distance(touchBank[i], touchBank[j], ofCurrent);
      if (d > max) {
        max = d;
      }
    }
  }
  return max;
}

function scaleDistance(touchHistory, touchesChangedAfter, ofCurrent) {
  let touchBank = touchHistory.touchBank;
  if (touchHistory.numberActiveTouches > 1) {
    let filteredTouchBank = touchBank.filter(touchTrack => {
      return touchTrack && touchTrack.currentTimeStamp >= touchesChangedAfter;
    });
    return maxDistance(filteredTouchBank, ofCurrent);
  }
}

/**
 * @providesModule TouchHistoryMath
 */

const TouchHistoryMath = {
  /**
   * This code is optimized and not intended to look beautiful. This allows
   * computing of touch centroids that have moved after `touchesChangedAfter`
   * timeStamp. You can compute the current centroid involving all touches
   * moves after `touchesChangedAfter`, or you can compute the previous
   * centroid of all touches that were moved after `touchesChangedAfter`.
   *
   * @param {TouchHistoryMath} touchHistory Standard Responder touch track
   * data.
   * @param {number} touchesChangedAfter timeStamp after which moved touches
   * are considered "actively moving" - not just "active".
   * @param {boolean} isXAxis Consider `x` dimension vs. `y` dimension.
   * @param {boolean} ofCurrent Compute current centroid for actively moving
   * touches vs. previous centroid of now actively moving touches.
   * @return {number} value of centroid in specified dimension.
   */
  centroidDimension(touchHistory, touchesChangedAfter, isXAxis, ofCurrent) {
    var touchBank = touchHistory.touchBank;
    var total = 0;
    var count = 0;

    var oneTouchData =
      touchHistory.numberActiveTouches === 1
        ? touchHistory.touchBank[touchHistory.indexOfSingleActiveTouch]
        : null;

    if (oneTouchData !== null) {
      if (
        oneTouchData.touchActive &&
        oneTouchData.currentTimeStamp > touchesChangedAfter
      ) {
        total +=
          ofCurrent && isXAxis
            ? oneTouchData.currentPageX
            : ofCurrent && !isXAxis
            ? oneTouchData.currentPageY
            : !ofCurrent && isXAxis
            ? oneTouchData.previousPageX
            : oneTouchData.previousPageY;
        count = 1;
      }
    } else {
      for (var i = 0; i < touchBank.length; i++) {
        var touchTrack = touchBank[i];
        if (
          touchTrack !== null &&
          touchTrack !== undefined &&
          touchTrack.touchActive &&
          touchTrack.currentTimeStamp >= touchesChangedAfter
        ) {
          var toAdd; // Yuck, program temporarily in invalid state.
          if (ofCurrent && isXAxis) {
            toAdd = touchTrack.currentPageX;
          } else if (ofCurrent && !isXAxis) {
            toAdd = touchTrack.currentPageY;
          } else if (!ofCurrent && isXAxis) {
            toAdd = touchTrack.previousPageX;
          } else {
            toAdd = touchTrack.previousPageY;
          }
          total += toAdd;
          count++;
        }
      }
    }
    return count > 0 ? total / count : TouchHistoryMath.noCentroid;
  },

  currentCentroidXOfTouchesChangedAfter(touchHistory, touchesChangedAfter) {
    return TouchHistoryMath.centroidDimension(
      touchHistory,
      touchesChangedAfter,
      true, // isXAxis
      true // ofCurrent
    );
  },

  currentCentroidYOfTouchesChangedAfter(touchHistory, touchesChangedAfter) {
    return TouchHistoryMath.centroidDimension(
      touchHistory,
      touchesChangedAfter,
      false, // isXAxis
      true // ofCurrent
    );
  },

  previousCentroidXOfTouchesChangedAfter(touchHistory, touchesChangedAfter) {
    return TouchHistoryMath.centroidDimension(
      touchHistory,
      touchesChangedAfter,
      true, // isXAxis
      false // ofCurrent
    );
  },

  previousCentroidYOfTouchesChangedAfter(touchHistory, touchesChangedAfter) {
    return TouchHistoryMath.centroidDimension(
      touchHistory,
      touchesChangedAfter,
      false, // isXAxis
      false // ofCurrent
    );
  },

  currentCentroidX(touchHistory) {
    return TouchHistoryMath.centroidDimension(
      touchHistory,
      0, // touchesChangedAfter
      true, // isXAxis
      true // ofCurrent
    );
  },

  currentCentroidY(touchHistory) {
    return TouchHistoryMath.centroidDimension(
      touchHistory,
      0, // touchesChangedAfter
      false, // isXAxis
      true // ofCurrent
    );
  },

  noCentroid: -1,
};

const currentCentroidXOfTouchesChangedAfter =
  TouchHistoryMath.currentCentroidXOfTouchesChangedAfter;
const currentCentroidYOfTouchesChangedAfter =
  TouchHistoryMath.currentCentroidYOfTouchesChangedAfter;
const previousCentroidXOfTouchesChangedAfter =
  TouchHistoryMath.previousCentroidXOfTouchesChangedAfter;
const previousCentroidYOfTouchesChangedAfter =
  TouchHistoryMath.previousCentroidYOfTouchesChangedAfter;
const currentCentroidX = TouchHistoryMath.currentCentroidX;
const currentCentroidY = TouchHistoryMath.currentCentroidY;

const TAP_UP_TIME_THRESHOLD = 400;
const TAP_MOVE_THRESHOLD = 10;
const MOVE_THRESHOLD = 2;

let DEV = false;

function initializeGestureState(gestureState) {
  gestureState.moveX = 0;
  gestureState.moveY = 0;
  gestureState.x0 = 0;
  gestureState.y0 = 0;
  gestureState.dx = 0;
  gestureState.dy = 0;
  gestureState.vx = 0;
  gestureState.vy = 0;
  gestureState.numberActiveTouches = 0;
  // All `gestureState` accounts for timeStamps up until:
  gestureState._accountsForMovesUpTo = 0;

  gestureState.previousMoveX = 0;
  gestureState.previousMoveY = 0;
  gestureState.scale = 1;
  gestureState.rotation = 0;
  gestureState.previousScale = 1;
  gestureState.singleTapUp = false;
  gestureState.doubleTapUp = false;
  gestureState._singleTabFailed = false;
}

function updateGestureStateOnMove(gestureState, touchHistory, e) {
  const movedAfter = gestureState._accountsForMovesUpTo;
  const prevX = previousCentroidXOfTouchesChangedAfter(
    touchHistory,
    movedAfter
  );
  const x = currentCentroidXOfTouchesChangedAfter(touchHistory, movedAfter);
  const prevY = previousCentroidYOfTouchesChangedAfter(
    touchHistory,
    movedAfter
  );
  const y = currentCentroidYOfTouchesChangedAfter(touchHistory, movedAfter);
  const dx = x - prevX;
  const dy = y - prevY;

  gestureState.numberActiveTouches = touchHistory.numberActiveTouches;
  gestureState.moveX = x;
  gestureState.moveY = y;

  gestureState.totalDeltaX = x - gestureState.x0;
  gestureState.totalDeltaY = y - gestureState.y0;

  // TODO: This must be filtered intelligently.
  //const dt = touchHistory.mostRecentTimeStamp - movedAfter;
  const dt = convertToMillisecIfNeeded(
    touchHistory.mostRecentTimeStamp - movedAfter
  );
  gestureState.vx = dx / dt;
  gestureState.vy = dy / dt;
  gestureState.velocity =
    Math.abs(gestureState.vx) > Math.abs(gestureState.vy)
      ? gestureState.vx
      : gestureState.vy;

  gestureState.dx += dx;
  gestureState.dy += dy;
  gestureState._accountsForMovesUpTo = touchHistory.mostRecentTimeStamp;

  gestureState.previousMoveX = prevX;
  gestureState.previousMoveY = prevY;
  gestureState.rotation = 0;
  const mult = 0.01;
  gestureState.scale = scaleDistance(touchHistory, movedAfter, true) * mult;
  gestureState.scale = isNaN(gestureState.scale) ? 1 : gestureState.scale;
  gestureState.previousScale =
    scaleDistance(touchHistory, movedAfter, false) * mult;
  gestureState.previousScale = isNaN(gestureState.previousScale)
    ? 1
    : gestureState.previousScale;
}

function clearInteractionHandle(interactionState) {
  if (interactionState.handle) {
    InteractionManager.clearInteractionHandle(interactionState.handle);
    interactionState.handle = null;
  }
}

/**
 * Due to commit https://github.com/facebook/react-native/commit/f2c1868b56bdfc8b0d6f448733848eafed2cd440,
 * Android is using nanoseconds while iOS is using milliseconds.
 * @param interval
 * @returns {*}
 */
function convertToMillisecIfNeeded(interval) {
  if (interval > 1000000) {
    return interval / 1000000;
  }
  return interval;
}

function cancelSingleTapConfirm(gestureState) {
  if (typeof gestureState._singleTapConfirmId !== 'undefined') {
    clearTimeout(gestureState._singleTapConfirmId);
    gestureState._singleTapConfirmId = undefined;
  }
}

/**
 * The config object contains same callbacks as the default gesture responder(https://facebook.github.io/react-native/docs/gesture-responder-system.html).
 * And every callback are called with an additional argument 'gestureState', like PanResponder.
 * @param config
 * @returns {{}}
 */

/**
 * The config object contains same callbacks as the default gesture responder(https://facebook.github.io/react-native/docs/gesture-responder-system.html).
 * And every callback are called with an additional argument 'gestureState', like PanResponder.
 * @param config
 * @param debug true to enable debug logs
 * @returns {{}}
 */
function createResponder(config) {
  if (config.debug) {
    DEV = true;
  }

  const interactionState = {
    handle: null,
  };
  const gestureState = {
    // Useful for debugging
    stateID: Math.random(),
  };
  initializeGestureState(gestureState);

  const handlers = {
    onStartShouldSetResponder(e) {
      DEV && console.log('onStartShouldSetResponder...');
      cancelSingleTapConfirm(gestureState);
      return config.onStartShouldSetResponder
        ? config.onStartShouldSetResponder(e, gestureState)
        : false;
    },
    onMoveShouldSetResponder(e) {
      DEV && console.log('onMoveShouldSetResponder...');

      return config.onMoveShouldSetResponder &&
        effectiveMove(config, gestureState)
        ? config.onMoveShouldSetResponder(e, gestureState)
        : false;
    },
    onStartShouldSetResponderCapture(e) {
      DEV && console.log('onStartShouldSetResponderCapture...');
      cancelSingleTapConfirm(gestureState);
      // TODO: Actually, we should reinitialize the state any time
      // touches.length increases from 0 active to > 0 active.
      if (e.nativeEvent.touches.length === 1) {
        initializeGestureState(gestureState);
      }
      gestureState.numberActiveTouches = e.touchHistory.numberActiveTouches;
      return config.onStartShouldSetResponderCapture
        ? config.onStartShouldSetResponderCapture(e, gestureState)
        : false;
    },

    onMoveShouldSetResponderCapture(e) {
      DEV && console.log('onMoveShouldSetResponderCapture...');
      const touchHistory = e.touchHistory;
      // Responder system incorrectly dispatches should* to current responder
      // Filter out any touch moves past the first one - we would have
      // already processed multi-touch geometry during the first event.
      if (
        gestureState._accountsForMovesUpTo === touchHistory.mostRecentTimeStamp
      ) {
        return false;
      }
      updateGestureStateOnMove(gestureState, touchHistory, e);
      return config.onMoveShouldSetResponderCapture &&
        effectiveMove(config, gestureState)
        ? config.onMoveShouldSetResponderCapture(e, gestureState)
        : false;
    },

    onResponderGrant(e) {
      DEV && console.log('onResponderGrant...');
      cancelSingleTapConfirm(gestureState);
      if (!interactionState.handle) {
        interactionState.handle = InteractionManager.createInteractionHandle();
      }
      gestureState._grantTimestamp = e.touchHistory.mostRecentTimeStamp;
      gestureState.x0 = currentCentroidX(e.touchHistory);
      gestureState.y0 = currentCentroidY(e.touchHistory);
      gestureState.dx = 0;
      gestureState.dy = 0;
      if (config.onResponderGrant) {
        config.onResponderGrant(e, gestureState);
      }
      // TODO: t7467124 investigate if this can be removed
      return config.onShouldBlockNativeResponder === undefined
        ? true
        : config.onShouldBlockNativeResponder();
    },

    onResponderReject(e) {
      DEV && console.log('onResponderReject...');
      clearInteractionHandle(interactionState);
      config.onResponderReject && config.onResponderReject(e, gestureState);
    },

    onResponderRelease(e) {
      if (gestureState.singleTapUp) {
        if (gestureState._lastSingleTapUp) {
          if (
            convertToMillisecIfNeeded(
              e.touchHistory.mostRecentTimeStamp -
                gestureState._lastReleaseTimestamp
            ) < TAP_UP_TIME_THRESHOLD
          ) {
            gestureState.doubleTapUp = true;
          }
        }
        gestureState._lastSingleTapUp = true;

        //schedule to confirm single tap
        if (!gestureState.doubleTapUp) {
          const snapshot = Object.assign({}, gestureState);
          const timeoutId = setTimeout(() => {
            if (gestureState._singleTapConfirmId === timeoutId) {
              DEV && console.log('onResponderSingleTapConfirmed...');
              config.onResponderSingleTapConfirmed &&
                config.onResponderSingleTapConfirmed(e, snapshot);
            }
          }, TAP_UP_TIME_THRESHOLD);
          gestureState._singleTapConfirmId = timeoutId;
        }
      }
      gestureState._lastReleaseTimestamp = e.touchHistory.mostRecentTimeStamp;

      DEV &&
        console.log('onResponderRelease...' + JSON.stringify(gestureState));
      clearInteractionHandle(interactionState);
      config.onResponderRelease && config.onResponderRelease(e, gestureState);
      initializeGestureState(gestureState);
    },

    onResponderStart(e) {
      DEV && console.log('onResponderStart...');
      const touchHistory = e.touchHistory;
      gestureState.numberActiveTouches = touchHistory.numberActiveTouches;
      if (config.onResponderStart) {
        config.onResponderStart(e, gestureState);
      }
    },

    onResponderMove(e) {
      const touchHistory = e.touchHistory;
      // Guard against the dispatch of two touch moves when there are two
      // simultaneously changed touches.
      if (
        gestureState._accountsForMovesUpTo === touchHistory.mostRecentTimeStamp
      ) {
        return;
      }
      // Filter out any touch moves past the first one - we would have
      // already processed multi-touch geometry during the first event.
      updateGestureStateOnMove(gestureState, touchHistory, e);

      DEV && console.log('onResponderMove...' + JSON.stringify(gestureState));
      if (config.onResponderMove && effectiveMove(config, gestureState)) {
        config.onResponderMove(e, gestureState);
      }
    },

    onResponderEnd(e) {
      const touchHistory = e.touchHistory;
      gestureState.numberActiveTouches = touchHistory.numberActiveTouches;

      if (
        touchHistory.numberActiveTouches > 0 ||
        convertToMillisecIfNeeded(
          touchHistory.mostRecentTimeStamp - gestureState._grantTimestamp
        ) > TAP_UP_TIME_THRESHOLD ||
        Math.abs(gestureState.dx) >= TAP_MOVE_THRESHOLD ||
        Math.abs(gestureState.dy) >= TAP_MOVE_THRESHOLD
      ) {
        gestureState._singleTabFailed = true;
      }
      if (!gestureState._singleTabFailed) {
        gestureState.singleTapUp = true;
      }

      DEV && console.log('onResponderEnd...' + JSON.stringify(gestureState));
      clearInteractionHandle(interactionState);
      config.onResponderEnd && config.onResponderEnd(e, gestureState);
    },

    onResponderTerminate(e) {
      DEV && console.log('onResponderTerminate...');
      clearInteractionHandle(interactionState);
      config.onResponderTerminate &&
        config.onResponderTerminate(e, gestureState);
      initializeGestureState(gestureState);
    },

    onResponderTerminationRequest(e) {
      DEV && console.log('onResponderTerminationRequest...');
      return config.onResponderTerminationRequest
        ? config.onResponderTerminationRequest(e.gestureState)
        : true;
    },
  };
  return { ...handlers };
}

/**
 * On Android devices, the default gesture responder is too sensitive that a single tap(no move intended) may trigger a move event.
 * We can use a moveThreshold config to avoid those unwanted move events.
 * @param config
 * @param gestureState
 * @returns {boolean}
 */
function effectiveMove(config, gestureState) {
  if (gestureState.numberActiveTouches > 1) {
    // on iOS simulator, a scale gesture(move with alt pressed) will not change gestureState.dx(always 0)
    return true;
  }

  let moveThreshold = MOVE_THRESHOLD;
  if (typeof config.moveThreshold === 'number') {
    moveThreshold = config.minMoveDistance;
  }
  if (
    Math.abs(gestureState.dx) >= moveThreshold ||
    Math.abs(gestureState.dy) >= moveThreshold
  ) {
    return true;
  }
  return false;
}

function ensureConfig(config) {
  const props = {};
  // TODO: Bacon: parse & ensure range arrays are valid
  // props.maxDeltaX = config.maxDeltaX;
  // props.maxDeltaY = config.maxDeltaY;
  // props.maxDist = config.maxDist;
  if ('activeOffsetX' in config) {
    props.activeOffsetX = getRangeValue(config.activeOffsetX);
  }
  if ('activeOffsetY' in config) {
    props.activeOffsetY = getRangeValue(config.activeOffsetY);
  }
  if ('failOffsetY' in config) {
    props.failOffsetY = getRangeValue(config.failOffsetY);
  }
  if ('failOffsetX' in config) {
    props.failOffsetX = getRangeValue(config.failOffsetX);
  }
  if ('simultaneousHandlers' in config) {
  }
  if ('waitFor' in config) {
  }
  props.minVelocity = config.minVelocity;
  props.minVelocityX = config.minVelocityX;
  props.minVelocityY = config.minVelocityY;
  props.minPointers = config.minPointers;
  props.maxPointers = config.maxPointers;
  props.direction = config.direction;

  return props;
}
class UnimplementedGestureHandler extends React.Component {
  setNativeProps = () => {
    // Do nothing
  };

  render() {
    return this.props.children;
  }
}

const rangeFromNumber = value => [-value, value];

const valueInRange = (value, range) => {
  return value >= range[0] || value <= range[1];
};

const valueOutOfRange = (value, range) => {
  return value <= range[0] || value >= range[1];
};

function getRangeValue(value) {
  if (Array.isArray(value)) {
    if (!value.length || value.length > 2) {
      throw new Error('Range value must only contain 2 values');
    } else if (value.length === 1) {
      return getRangeValue(value[0]);
    }
    return value;
  } else {
    return value < 0 ? [value, -value] : [-value, value];
  }
}

import { findDOMNode } from 'react-dom';

const getElement = component => {
  try {
    return findDOMNode(component);
  } catch (e) {
    return component;
  }
};
const freezeBody = e => {
  e.preventDefault();
};

class PanGestureHandler extends React.Component {
  static defaultProps = {
    // maxDeltaX: Number.MAX_SAFE_INTEGER,
    // maxDeltaY: Number.MAX_SAFE_INTEGER,
    // maxDist: Number.MAX_SAFE_INTEGER,
    activeOffsetY: rangeFromNumber(0),
    activeOffsetX: rangeFromNumber(0),
    failOffsetY: rangeFromNumber(Infinity),
    failOffsetX: rangeFromNumber(Infinity),
    minVelocity: 0, // PropTypes.number,
    minVelocityX: 0, // PropTypes.number,
    minVelocityY: 0, // PropTypes.number,
    minPointers: 1,
    maxPointers: 1,
    direction: null, //Directions.DIRECTION_UP,
    _validateCriteria: validateCriteria,
  };

  config = {};

  // TODO: Bacon: State.UNDETERMINED

  updateConfig = config => {
    this.config = {
      ...this.config,
      ...ensureConfig(config),
    };
  };

  shouldStart = (event, gestureState) => {
    // event.preventDefault();

    // console.log(event.nativeEvent);
    return this.props._validateCriteria(
      {
        pointerLength: event.nativeEvent.touches.length,
        velocity: gestureState.velocity,
        vx: gestureState.vx,
        vy: gestureState.vy,
        dx: gestureState.dx,
        dy: gestureState.dy,
      },
      this.config
    );
  };

  _onGestureEvent = event => {
    if (this.props.onGestureEvent) {
      this.props.onGestureEvent(event);
    }
  };

  _onHandlerStateChange = event => {
    if (this.props.onHandlerStateChange) {
      this.props.onHandlerStateChange(event);
    }
  };

  _fromEvent = (state, oldState, { nativeEvent }, gestureState) => ({
    nativeEvent: {
      // pointerInside: true,
      state: state || State.UNDETERMINED,
      direction: undefined,
      oldState,
      translationX: gestureState.dx,
      translationY: gestureState.dy,
      velocityX: gestureState.vx,
      velocityY: gestureState.vy,
      x: gestureState.moveX,
      y: gestureState.moveY,
      absoluteX: nativeEvent.pageX,
      absoluteY: nativeEvent.pageY,
      velocity: gestureState.velocity,
      rotation: gestureState.rotation,
      // rotation: gestureState.fff,
      scale: gestureState.scale,
      // focalX: gestureState.fff,
      // focalY: gestureState.fff,
    },
    timeStamp: nativeEvent.timestamp,
  });

  constructor(props, context) {
    super(props, context);
    this.updateConfig(props);

    this._panResponder = createResponder({
      onStartShouldSetResponder: (event, gestureState) => {
        this.shouldStart(event, gestureState);
        this._onHandlerStateChange(
          this._fromEvent(State.BEGAN, State.UNDETERMINED, event, gestureState)
        );
      },
      onStartShouldSetResponderCapture: (event, gestureState) =>
        this.shouldStart(event, gestureState),
      onMoveShouldSetResponder: (event, gestureState) =>
        this.shouldStart(event, gestureState),
      onMoveShouldSetResponderCapture: (event, gestureState) =>
        this.shouldStart(event, gestureState),
      onResponderGrant: (event, gestureState) => {
        this._onHandlerStateChange(
          this._fromEvent(State.ACTIVE, State.BEGAN, event, gestureState)
        );
      },
      onResponderMove: (event, gestureState) => {
        // console.log('Move',
        // event.nativeEvent,
        // JSON.stringify(gestureState, null, 2)
        // );
        this._onGestureEvent(
          this._fromEvent(State.ACTIVE, State.ACTIVE, event, gestureState)
        );
      },

      // TODO: Bacon
      onResponderTerminationRequest: (event, gestureState) => true,

      onResponderRelease: (event, gestureState) => {
        this._onGestureEvent(
          this._fromEvent(State.END, State.ACTIVE, event, gestureState)
        );
      },
      onResponderTerminate: (event, gestureState) => {
        this._onGestureEvent(
          this._fromEvent(State.CANCELLED, State.ACTIVE, event, gestureState)
        );
      },
      debug: false,
    });
  }

  componentWillUnmount() {
    if (this.view) {
      this.view.removeEventListener('touchstart', freezeBody, false);
      this.view.removeEventListener('touchmove', freezeBody, false);
    }
  }

  componentWillReceiveProps(props) {
    this.updateConfig(props);
  }

  setRef = ref => {
    const nextView = getElement(ref);
    if (nextView && nextView.addEventListener) {
      nextView.addEventListener('touchstart', freezeBody, false);
      nextView.addEventListener('touchmove', freezeBody, false);
    }
    if (this.ref && this.ref.removeEventListener) {
      this.ref.removeEventListener('touchstart', freezeBody, false);
      this.ref.removeEventListener('touchmove', freezeBody, false);
    }
    this.ref = nextView;
  };

  setNativeProps(...props) {
    this.ref.setNativeProps(...props);
  }

  render() {
    const { style, ...props } = this.props;
    return (
      <View
        {...props}
        style={[{ flex: 1 }, style]}
        ref={this.setRef}
        {...this._panResponder}
      />
    );
  }
}

const PinchGestureHandler = React.forwardRef((props, ref) => (
  <PanGestureHandler
    ref={ref}
    {...props}
    _validateCriteria={(event, config) => {
      return true;
    }}
  />
));
const RotationGestureHandler = React.forwardRef((props, ref) => (
  <PanGestureHandler
    ref={ref}
    {...props}
    _validateCriteria={(event, config) => {
      return true;
    }}
  />
));

function validateCriteria(
  { pointerLength, velocity, vx, vy, dx, dy },
  {
    minPointers,
    maxPointers,
    minVelocity,
    minVelocityX,
    minVelocityY,
    failOffsetX,
    failOffsetY,
    activeOffsetX,
    activeOffsetY,
  }
) {
  const validPointerCount =
    pointerLength >= minPointers && pointerLength <= maxPointers;
  const isFastEnough =
    Math.abs(velocity) >= minVelocity &&
    Math.abs(vx) >= minVelocityX &&
    Math.abs(vy) >= minVelocityY;

  const isWithinBounds =
    valueInRange(dx, failOffsetX) && valueInRange(dy, failOffsetY);

  const isLongEnough =
    valueOutOfRange(dx, activeOffsetX) && valueOutOfRange(dy, activeOffsetY);

  return validPointerCount && isFastEnough && isWithinBounds && isLongEnough;
}

class TapGestureHandler extends React.Component {
  static defaultProps = {
    numberOfTaps: 1,
    maxDurationMs: 500,
    maxDelayMs: 500,
    minPointers: 1,
    maxDeltaX: Number.MAX_SAFE_INTEGER,
    maxDeltaY: Number.MAX_SAFE_INTEGER,
    maxDist: Number.MAX_SAFE_INTEGER,
  };

  render() {
    const { children, style } = this.props;

    return (
      <TouchableWithoutFeedback
        style={style}
        onPressIn={this.handlePressIn}
        onPressOut={this.handlePressOut}>
        {children}
      </TouchableWithoutFeedback>
    );
  }
}

const handlers = {
  NativeViewGestureHandler: class NativeViewGestureHandler extends React.Component {
    render() {
      const { children } = this.props;

      return children;
    }
  },
  PanGestureHandler,
  RotationGestureHandler,
  PinchGestureHandler,
  TapGestureHandler,
};

export default function createHandler(handlerName, propTypes = {}) {
  class Handler extends React.Component {
    static displayName = handlerName;

    static propTypes = propTypes;

    componentDidMount() {
      if (!handlers[handlerName]) {
        console.warn(`${handlerName} is not yet supported on web.`);
      }
    }

    _refHandler = node => {
      this._viewNode = node;
    };

    setNativeProps = (...args) => {
      this._viewNode.setNativeProps(...args);
    };

    render() {
      const Handler = handlers[handlerName] || UnimplementedGestureHandler;

      return <Handler ref={this._refHandler} {...this.props} />;
    }
  }
  return Handler;
}
