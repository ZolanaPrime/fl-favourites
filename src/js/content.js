var branch_faves = new Set();
var branch_avoids = new Set();
var storylet_faves = new Set();
var storylet_avoids = new Set();
var card_faves = new Set();
var card_avoids = new Set();
var options = {};

var wrapObserver;
var observer;

const version = chrome.runtime.getManifest().version;

async function init() {
  chrome.storage.onChanged.addListener(onStorageChange);

  const event = new CustomEvent("PlayingFavouritesLoad");
  window.dispatchEvent(event);

  window.addEventListener("PlayingFavouritesLoad", suicide, false);
  window.addEventListener("keydown", shiftHandler, false);
  window.addEventListener("keypress", shiftHandler, false);
  window.addEventListener("keyup", shiftHandler, false);

  console.log(`Playing Favourites ${version} injected`);

  wrapObserver = new MutationSummary({
    rootNode: document.getElementById("root"),
    callback: async function(summaries) {
      if (summaries[0].added.length === 1) {
        await loadData();
        await registerObserver();
      }
    },
    queries: [{element: "#main"}]
  });

  // True in case of reinject
  if (document.getElementById("main")) {
    await loadData();
    await registerObserver();
  }
}

init();

async function registerObserver() {
  if (observer) observer.disconnect();
  observer = new MutationSummary({
    rootNode: document.getElementById("main"),
    callback: function(summaries) {
      fillClickHandlers();
      parseStorylets(true);
      parseFCStorylets(true);
	  parseCards();
    },
    queries: [{ attribute: "data-branch-id" }, { attribute: "data-event-id" }, { attribute: "disabled"}]
  });
  fillClickHandlers();
  parseStorylets(true);
  parseFCStorylets(true);
  parseCards();
}

// Gracefully shut down orphaned instance
function suicide() {
  console.log(`Playing Favourites ${version} content script orphaned`);
  wrapObserver.disconnect();
  observer.disconnect();
  window.removeEventListener("PlayingFavouritesLoad", suicide);
  document.getElementById("main").removeEventListener("click", protectAvoids, true);
}

function pageInject(func) {
  // Inject into the page context
  let s = document.createElement("script");
  s.textContent = "(" + func + ")();";
  (document.head || document.documentElement).appendChild(s);
  s.parentNode.removeChild(s);
}

// Make inline click/submit handlers visible to the isolated world
function fillClickHandlers() {
  // Record original button labels
  $(".storylet .button--go, .card__discard-button").each(function() {
    if (!this.dataset.originalValue) {
      this.dataset.originalValue = this.value;
    }
  });
}

function shiftHandler(e) {
  const shiftPressed = e.shiftKey;
  const $disabled = $("#main .pf-disabled");

  if ($disabled.length) {
    $disabled.each(function () {
      if (shiftPressed) {
        $(this).addClass("shift-pressed");
      } else {
        $(this).removeClass("shift-pressed");
      }
    });
  }
}

function parseStorylets(reorder = false) { // Call without options to ensure no reordering
  let $container = $("#main");
  let $branches = $("#main .media--branch");
  let $storylets = $("#main .storylet");

  let reorder_active = false;
  let reorder_locked = false;
  if (reorder) {
    switch (options.branch_reorder_mode) {
      case "branch_no_reorder":
        break;
      case "branch_reorder_active":
        reorder_active = true;
        break;
      case "branch_reorder_all":
        reorder_active = true;
        reorder_locked = true;
        break;
    }
  }

  let $faves;
  let $avoids;

  let $first;
  let $last_active;
  let $last;

  if ($branches.length) {
    $branches.each(function() {
      let match = this.dataset.branchId;
      if (match) {
        const branchId = parseInt(match);
        const active = $(this).hasClass("media--locked");

        $(this).find(".fave_toggle_button").remove();

        if ($(this).find(".button--go").prop("offsetParent") === null) { return; } // Fix for Protector extensions

        let $toggle_button = $('<input type="image" class="fave_toggle_button" title="Playing Favourites: toggle favourite">');
        $toggle_button.insertAfter($(this).find(".button--go").last()); // In case of insufficient actions, there are 2 buttons
        $toggle_button.attr("data-active", active);
        $toggle_button.attr("data-toggle-id", branchId);
        $toggle_button.click(branchToggle);

        if (branch_faves.has(branchId)) {
          $(this).addClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_filled.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else if (branch_avoids.has(branchId)) {
          $(this).removeClass("storylet_favourite");
          $(this).addClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_avoid.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().addClass("pf-disabled");
            $(this).find(".button--go").last().addClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else {
          $(this).removeClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_empty.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        }
      }
    });

    $branches.first().before('<div class="first_reorder_marker">');
    $first = $(".first_reorder_marker");

    $branches.last().after('<div class="last_reorder_marker">');
    $last = $(".last_reorder_marker");

    if ($branches.not(".media--locked").last().length) {
      $branches.not(".media--locked").last().after('<div class="last_active_reorder_marker">');
      $last_active = $(".last_active_reorder_marker");
    } else {
      $last_active = $last;
    }

    $faves = $branches.filter(".storylet_favourite");
    $avoids = $branches.filter(".storylet_avoid");
  } else if ($storylets.length) {
    $storylets.each(function() {
      let match = this.dataset.branchId;

      if (match) {
        const storyletId = parseInt(match);
        const active = $(this).hasClass("media--locked");

        $(this).find(".fave_toggle_button").remove();

        if ($(this).find(".button--go").prop("offsetParent") === null) { return; } // Fix for Protector extensions

        let $toggle_button = $('<input type="image" class="fave_toggle_button" title="Playing Favourites: toggle favourite">');
        $toggle_button.insertAfter($(this).find(".button--go"));
        $toggle_button.attr("data-active", active);
        $toggle_button.attr("data-toggle-id", storyletId);
        $toggle_button.click(storyletToggle);

        if (storylet_faves.has(storyletId)) {
          $(this).addClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_filled.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else if (storylet_avoids.has(storyletId)) {
          $(this).removeClass("storylet_favourite");
          $(this).addClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_avoid.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().addClass("pf-disabled");
            $(this).find(".button--go").last().addClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else {
          $(this).removeClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_empty.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        }
      }
    });

    $storylets.first().before('<div class="first_reorder_marker">');
    $first = $(".first_reorder_marker");

    $storylets.last().after('<div class="last_reorder_marker">');
    $last = $(".last_reorder_marker");

    if ($storylets.not(".media--locked").last().length) {
      $storylets.not(".media--locked").last().after('<div class="last_active_reorder_marker">');
      $last_active = $(".last_active_reorder_marker");
    } else {
      $last_active = $last;
    }

    $faves = $storylets.filter(".storylet_favourite");
    $avoids = $storylets.filter(".storylet_avoid");
  }

  if ($faves && $faves.length) {
    if (reorder_locked) {
      $faves.filter(".media--locked").insertBefore($first);
    }

    if (reorder_active) {
      $faves.not(".media--locked").insertBefore($first);
    }
  }

  if ($avoids && $avoids.length) {
    if (reorder_locked) {
      $avoids.filter(".media--locked").insertAfter($last_active);
    }

    if (reorder_active) {
      $avoids.not(".media--locked").insertAfter($last_active);
    }
  }

  $(".first_reorder_marker, .last_active_reorder_marker, .last_reorder_marker").remove();
}

// Fix for Fifth City Stories not being toggleable

function parseFCStorylets(reorder = false) { // Call without options to ensure no reordering
  let $container = $("#main");
  let $branches = $("#main .media--branch");
  let $storylets = $("#main .persistent");

  let reorder_active = false;
  let reorder_locked = false;
  if (reorder) {
    switch (options.branch_reorder_mode) {
      case "branch_no_reorder":
        break;
      case "branch_reorder_active":
        reorder_active = true;
        break;
      case "branch_reorder_all":
        reorder_active = true;
        reorder_locked = true;
        break;
    }
  }

  let $faves;
  let $avoids;

  let $first;
  let $last_active;
  let $last;

  if ($branches.length) {
    $branches.each(function() {
      let match = this.dataset.branchId;
      if (match) {
        const branchId = parseInt(match);
        const active = $(this).hasClass("media--locked");

        $(this).find(".fave_toggle_button").remove();

        if ($(this).find(".button--go").prop("offsetParent") === null) { return; } // Fix for Protector extensions

        let $toggle_button = $('<input type="image" class="fave_toggle_button" title="Playing Favourites: toggle favourite">');
        $toggle_button.insertAfter($(this).find(".button--go").last()); // In case of insufficient actions, there are 2 buttons
        $toggle_button.attr("data-active", active);
        $toggle_button.attr("data-toggle-id", branchId);
        $toggle_button.click(branchToggle);

        if (branch_faves.has(branchId)) {
          $(this).addClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_filled.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else if (branch_avoids.has(branchId)) {
          $(this).removeClass("storylet_favourite");
          $(this).addClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_avoid.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().addClass("pf-disabled");
            $(this).find(".button--go").last().addClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else {
          $(this).removeClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_empty.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        }
      }
    });

    $branches.first().before('<div class="first_reorder_marker">');
    $first = $(".first_reorder_marker");

    $branches.last().after('<div class="last_reorder_marker">');
    $last = $(".last_reorder_marker");

    if ($branches.not(".media--locked").last().length) {
      $branches.not(".media--locked").last().after('<div class="last_active_reorder_marker">');
      $last_active = $(".last_active_reorder_marker");
    } else {
      $last_active = $last;
    }

    $faves = $branches.filter(".storylet_favourite");
    $avoids = $branches.filter(".storylet_avoid");
  } else if ($storylets.length) {
    $storylets.each(function() {
      let match = this.dataset.branchId;

      if (match) {
        const storyletId = parseInt(match);
        const active = $(this).hasClass("media--locked");

        $(this).find(".fave_toggle_button").remove();

        if ($(this).find(".button--go").prop("offsetParent") === null) { return; } // Fix for Protector extensions

        let $toggle_button = $('<input type="image" class="fave_toggle_button" title="Playing Favourites: toggle favourite">');
        $toggle_button.insertAfter($(this).find(".button--go"));
        $toggle_button.attr("data-active", active);
        $toggle_button.attr("data-toggle-id", storyletId);
        $toggle_button.click(storyletToggle);

        if (storylet_faves.has(storyletId)) {
          $(this).addClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_filled.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else if (storylet_avoids.has(storyletId)) {
          $(this).removeClass("storylet_favourite");
          $(this).addClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_avoid.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().addClass("pf-disabled");
            $(this).find(".button--go").last().addClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        } else {
          $(this).removeClass("storylet_favourite");
          $(this).removeClass("storylet_avoid");
          $toggle_button.attr("src", chrome.runtime.getURL("img/button_empty.png"));

          if (options.block_action) {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          } else {
            $(this).find(".button--go").last().removeClass("pf-disabled");
            $(this).find(".button--go").last().removeClass("button--disabled");
          }
        }
      }
    });

    $storylets.first().before('<div class="first_reorder_marker">');
    $first = $(".first_reorder_marker");

    $storylets.last().after('<div class="last_reorder_marker">');
    $last = $(".last_reorder_marker");

    if ($storylets.not(".media--locked").last().length) {
      $storylets.not(".media--locked").last().after('<div class="last_active_reorder_marker">');
      $last_active = $(".last_active_reorder_marker");
    } else {
      $last_active = $last;
    }

    $faves = $storylets.filter(".storylet_favourite");
    $avoids = $storylets.filter(".storylet_avoid");
  }

  if ($faves && $faves.length) {
    if (reorder_locked) {
      $faves.filter(".media--locked").insertBefore($first);
    }

    if (reorder_active) {
      $faves.not(".media--locked").insertBefore($first);
    }
  }

  if ($avoids && $avoids.length) {
    if (reorder_locked) {
      $avoids.filter(".media--locked").insertAfter($last_active);
    }

    if (reorder_active) {
      $avoids.not(".media--locked").insertAfter($last_active);
    }
  }

  $(".first_reorder_marker, .last_active_reorder_marker, .last_reorder_marker").remove();
}


//###################################################################################################




function parseCards() {
  const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

  // full-sized cards
  let $cards = $("#main .hand__card-container, #main .small-card-container");

  $cards.each(function() {
    let match;
    if (this.dataset.eventId) {
      match = this.dataset.eventId;
    }

    if (match) {
      const cardId = parseInt(match);

      $(this).find(".card_toggle_button").remove();

      if (this.offsetParent === null) { return; } // Fix for Protector extensions

      let $toggle_button = $('<button class="card_toggle_button" title="Playing Favourites: toggle favourite" />');

      if ($(this).hasClass('hand__card-container')) {
        $(this).append($toggle_button);
      } else {
        $(this).find('.buttons').append($toggle_button);
      }

      $toggle_button.attr("data-toggle-id", cardId);

      $toggle_button.click(cardToggle);

      let $card_discard = $(this).find('.card__discard-button, .buttonlet-container');

      const ffCardFaveClass = isFirefox ? 'firefox_card_fave' : '';
      const ffCardAvoidClass = isFirefox ? 'firefox_card_avoid' : '';
      const ffCardEmptyClass = isFirefox ? 'firefox_card_empty' : '';

      $(this).addClass(ffCardEmptyClass);

      if (card_avoids.has(cardId)) {
        $(this).removeClass("card_fave");
        $(this).addClass("card_avoid");
        $(this).removeClass(ffCardFaveClass);
        $(this).addClass(ffCardAvoidClass);
        $card_discard.addClass('button_fave');
        $card_discard.removeClass('button_avoid');

        if (options.block_action) { 
          $(this).find(".card__discard-button").last().removeClass("pf-disabled");
          $(this).find(".card__discard-button").last().removeClass("button--disabled");
          $(this).find(".button--margin").last().addClass("pf-disabled");
          $(this).find(".hand__card").last().addClass("pf-disabled");
          $(this).find(".buttonlet-container").last().removeClass("pf-disabled");
		  $(this).find(".buttonlet-container").last().removeClass("button--disabled");
        } else {
          $(this).find(".card__discard-button").last().removeClass("pf-disabled");
          $(this).find(".card__discard-button").last().removeClass("button--disabled");
          $(this).find(".button--margin").last().removeClass("pf-disabled");
          $(this).find(".hand__card").last().removeClass("pf-disabled");
          $(this).find(".buttonlet-container").last().removeClass("pf-disabled");
		  $(this).find(".buttonlet-container").last().removeClass("button--disabled");
        }
      } else if (card_faves.has(cardId)) {
        $(this).addClass("card_fave");
        $(this).removeClass("card_avoid");
        $(this).removeClass(ffCardAvoidClass);
        $(this).addClass(ffCardFaveClass);
        $card_discard.removeClass('button_fave');
        $card_discard.addClass('button_avoid');

        if (options.block_action) { 
          $(this).find(".card__discard-button").last().addClass("pf-disabled");
          $(this).find(".card__discard-button").last().addClass("button--disabled");
          $(this).find(".button--margin").last().removeClass("pf-disabled");
          $(this).find(".hand__card").last().removeClass("pf-disabled");
          $(this).find(".buttonlet-container").last().addClass("pf-disabled");
		  $(this).find(".buttonlet-container").last().addClass("button--disabled");
        } else { 
          $(this).find(".card__discard-button").last().removeClass("pf-disabled");
          $(this).find(".card__discard-button").last().removeClass("button--disabled");
          $(this).find(".button--margin").last().removeClass("pf-disabled");
          $(this).find(".hand__card").last().removeClass("pf-disabled");
          $(this).find(".buttonlet-container").last().removeClass("pf-disabled");
		  $(this).find(".buttonlet-container").last().removeClass("button--disabled");
        }
      } else {
        $(this).removeClass("card_fave");
        $(this).removeClass("card_avoid");
        $(this).removeClass(ffCardFaveClass);
        $(this).removeClass(ffCardAvoidClass);
        $card_discard.removeClass('button_fave');
        $card_discard.removeClass('button_avoid');

        $(this).find(".card__discard-button").last().removeClass("pf-disabled");
        $(this).find(".card__discard-button").last().removeClass("button--disabled");
        $(this).find(".button--margin").last().removeClass("pf-disabled");
        $(this).find(".hand__card").last().removeClass("pf-disabled");
        $(this).find(".buttonlet-container").last().removeClass("pf-disabled");
		$(this).find(".buttonlet-container").last().removeClass("button--disabled");
      }
    }
  });
}

async function onStorageChange(changes, area) {
  if (area === "local") {
    await loadData();
    parseStorylets();
	parseFCStorylets()
    parseCards();
  }
}

async function loadData() {
  data = await getOptions();

  branch_faves = unpackSet(data, "branch_faves");
  branch_avoids = unpackSet(data, "branch_avoids");
  storylet_faves = unpackSet(data, "storylet_faves");
  storylet_avoids = unpackSet(data, "storylet_avoids");
  card_faves = unpackSet(data, "card_faves");
  card_avoids = unpackSet(data, "card_avoids");

  options.branch_reorder_mode = data.branch_reorder_mode;
  options.switch_mode = data.switch_mode;
  options.block_action = data.block_action === "true";
  options.protectInterval = 2000; // TODO: Make configurable

  // initializeProtector(); // TODO: Finish implementation
}

function protectAvoids(e) {
  if (e.metaKey || e.ctrlKey) { return; } // Ctrl-click always bypasses protection

  // If clicked on branch selection OR button set to avoid
  if ($(e.target).is(".storylet_avoid .button--go span, .button_avoid")) {
    let time = Date.now();
    if (
      !e.target.dataset.protectTimestamp ||
      (time - e.target.dataset.protectTimestamp) >= options.protectInterval
    ) {
      // Prevent page's inline handler from firing
      e.stopImmediatePropagation();
      e.preventDefault();

      let $confirmText = $('<span class="protect-confirm">SURE?</span>');
      $(e.target).append($confirmText);
      $(e.target).addClass('button-protected');
      setTimeout(
        function() {
          $(e.target).removeClass('button-protected');
          $confirmText.remove();
        },
        options.protectInterval
      );

      e.target.dataset.protectTimestamp = time;
    }
  }
}

function initializeProtector() {
  // Intercept clicks to avoided elements
  document.getElementById("main").addEventListener(
    "click",
    protectAvoids,
    true // Capture before it reaches inline onclick
  );
}

async function branchToggle(e) {
  e.preventDefault();

  const branchId = parseInt(this.dataset.toggleId);

  switch (options.switch_mode) {
    case "modifier_click":
      const modifier = (e.metaKey || e.ctrlKey);
      if (modifier) {
        if (branch_avoids.has(branchId)) {
          await setBranchFave(branchId, "none");
        } else {
          await setBranchFave(branchId, "avoid");
        }
      } else {
        if (branch_faves.has(branchId)) {
          await setBranchFave(branchId, "none");
        } else {
          await setBranchFave(branchId, "fave");
        }
      }
      break;
    case "click_through":
      if (branch_faves.has(branchId)) {
        await setBranchFave(branchId, "avoid");
      } else if (branch_avoids.has(branchId)) {
        await setBranchFave(branchId, "none");
      } else {
        await setBranchFave(branchId, "fave");
      }
      break;
  }
}

function storyletToggle(e) {
  e.preventDefault();

  const storyletId = parseInt(this.dataset.toggleId);

  switch (options.switch_mode) {
    case "modifier_click":
      const modifier = (e.metaKey || e.ctrlKey);
      if (modifier) {
        if (storylet_avoids.has(storyletId)) {
          setStoryletFave(storyletId, "none");
        } else {
          setStoryletFave(storyletId, "avoid");
        }
      } else {
        if (storylet_faves.has(storyletId)) {
          setStoryletFave(storyletId, "none");
        } else {
          setStoryletFave(storyletId, "fave");
        }
      }
      break;
    case "click_through":
      if (storylet_faves.has(storyletId)) {
        setStoryletFave(storyletId, "avoid");
      } else if (storylet_avoids.has(storyletId)) {
        setStoryletFave(storyletId, "none");
      } else {
        setStoryletFave(storyletId, "fave");
      }
      break;
  }
}

function cardToggle(e) {
  e.preventDefault();

  const cardId = parseInt(this.dataset.toggleId);

  switch (options.switch_mode) {
    case "modifier_click":
      const modifier = (e.metaKey || e.ctrlKey);
      if (modifier) {
        if (card_avoids.has(cardId)) {
          setCardFave(cardId, "none");
        } else {
          setCardFave(cardId, "avoid");
        }
      } else {
        if (card_faves.has(cardId)) {
          setCardFave(cardId, "none");
        } else {
          setCardFave(cardId, "fave");
        }
      }
      break;
    case "click_through":
      if (card_avoids.has(cardId)) {
        setCardFave(cardId, "none");
      } else if (card_faves.has(cardId)) {
        setCardFave(cardId, "avoid");
      } else {
        setCardFave(cardId, "fave");
      }
      break;
  }
}

async function saveFaves() {
  let data = {};

  Object.assign(data, branch_faves.pack("branch_faves"));
  Object.assign(data, branch_avoids.pack("branch_avoids"));
  Object.assign(data, storylet_faves.pack("storylet_faves"));
  Object.assign(data, storylet_avoids.pack("storylet_avoids"));
  Object.assign(data, card_faves.pack("card_faves"));
  Object.assign(data, card_avoids.pack("card_avoids"));

  await setOptions(data);
}

async function setBranchFave(branchId, mode) {
  switch (mode) {
    case "none":
      branch_faves.delete(branchId);
      branch_avoids.delete(branchId);
      break;
    case "avoid":
      branch_faves.delete(branchId);
      branch_avoids.add(branchId);
      break;
    case "fave":
      branch_faves.add(branchId);
      branch_avoids.delete(branchId);
      break;
  }
  await saveFaves();
  parseStorylets();
  parseFCStorylets();
}

async function setStoryletFave(storyletId, mode) {
  switch (mode) {
    case "none":
      storylet_faves.delete(storyletId);
      storylet_avoids.delete(storyletId);
      break;
    case "avoid":
      storylet_faves.delete(storyletId);
      storylet_avoids.add(storyletId);
      break;
    case "fave":
      storylet_faves.add(storyletId);
      storylet_avoids.delete(storyletId);
      break;
  }
  await saveFaves();
  parseStorylets();
  parseFCStorylets();
}

async function setCardFave(cardId, mode) {
  switch (mode) {
    case "none":
      card_avoids.delete(cardId);
      card_faves.delete(cardId);
      break;
    case "fave":
      card_avoids.delete(cardId);
      card_faves.add(cardId);
      break;
    case "avoid":
      card_avoids.add(cardId);
      card_faves.delete(cardId);
      break;
  }
  await saveFaves();
  parseCards();
}
