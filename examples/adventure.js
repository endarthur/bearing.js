// GEOLOGICAL ADVENTURE — a text adventure for OS²
// Fetched on demand when user types 'adventure' in the console.
(function() {
  'use strict';

  var state, rooms, items;

  function init() {
    items = {
      compass: { name: 'Clar compass', loc: 'camp', desc: 'A well-worn Clar compass. The brass is patinated from years of fieldwork. You can USE it at outcrops to take readings.' },
      notebook: { name: 'field notebook', loc: 'camp', desc: 'A waterproof Rite-in-the-Rain notebook. Several pages are filled with old readings.' },
      hammer: { name: 'rock hammer', loc: 'shed', desc: 'An Estwing E3-22P. The blue nylon grip is slightly worn.' },
      lens: { name: 'hand lens', loc: 'inventory', desc: 'A 10x Hastings triplet. The chrome is scratched but the optics are perfect.' },
      headlamp: { name: 'headlamp', loc: 'camp', desc: 'A battered Petzl with fresh batteries.' },
      sample: { name: 'rock sample', loc: null, desc: 'A chunk of folded gneiss with a beautiful ptygmatic vein.' },
      crystal: { name: 'crystal', loc: null, desc: 'A terminated quartz crystal, about 8cm long. Clear as water with phantom inclusions.' },
      key: { name: 'rusty key', loc: 'mine_entrance', desc: 'An old iron key. Stamped "BERGAMT 1897".' },
      fossil: { name: 'fossil', loc: null, desc: 'A trilobite preserved in dark shale. Excellent detail on the cephalon.' }
    };

    rooms = {
      camp: {
        name: 'Field Camp',
        desc: 'A small geological field camp in a mountain valley. A weathered canvas tent stands beside a folding table. Your laptop sits open, running OS\u00B2. A trail leads NORTH toward the hills. A tool shed is to the EAST.',
        exits: { n: 'trail', e: 'shed' },
        look: {}
      },
      shed: {
        name: 'Tool Shed',
        desc: 'A corrugated metal shed. Tools hang from nails on the wall. Dusty shelves hold sample bags and acid bottles. The camp is WEST.',
        exits: { w: 'camp' },
        look: {}
      },
      trail: {
        name: 'Trail Head',
        desc: 'A dirt trail winds through sparse pine trees. The field camp is SOUTH. The trail forks: WEST leads along a stream, NORTH climbs toward a rocky ridge, EAST descends to an old mine.',
        exits: { s: 'camp', w: 'stream', n: 'ridge_trail', e: 'mine_entrance' },
        look: {}
      },
      stream: {
        name: 'Stream Crossing',
        desc: 'A clear mountain stream flows over polished cobbles. Exposed bedrock on the far bank shows beautiful cross-bedding. You can cross NORTH to the outcrop, or head EAST back to the trail.',
        exits: { n: 'outcrop_base', e: 'trail' },
        look: { bedrock: 'The cross-bedding indicates paleocurrent flow toward the southeast. Classic fluvial facies.' }
      },
      outcrop_base: {
        name: 'Outcrop Base',
        desc: 'You stand at the base of a large road-cut exposure. Steeply dipping beds of alternating sandstone and shale stretch UP the face. The stream is SOUTH. A narrow path leads WEST along the base.',
        exits: { s: 'stream', u: 'outcrop_face', w: 'fossil_bed' },
        look: { beds: 'The beds dip steeply to the southeast. You can see at least three distinct lithological units.' }
      },
      outcrop_face: {
        name: 'Outcrop Face',
        desc: 'You are on a narrow ledge halfway up the exposure. Bedding planes are within arm\'s reach. The rock is a medium-grained arkosic sandstone with feldspar clasts. You can go DOWN.',
        exits: { d: 'outcrop_base' },
        reading: [120, 45],
        look: { sandstone: 'Subangular feldspar and quartz grains in a clay-rich matrix. Moderate sorting. Possibly a proximal alluvial fan deposit.', bedding: 'Clean, planar bedding surfaces. Perfect for taking a compass reading. Try USE COMPASS.' }
      },
      fossil_bed: {
        name: 'Fossil Bed',
        desc: 'A dark shale unit at the base of the sequence. The rock splits into thin fissile sheets. Something glints in the fresh exposure. The outcrop is EAST.',
        exits: { e: 'outcrop_base' },
        look: { shale: 'The shale is dark grey to black, finely laminated. Organic-rich — possibly a marine transgression.' },
        hasFossil: true
      },
      ridge_trail: {
        name: 'Ridge Trail',
        desc: 'A steep trail switchbacks up the hillside through scrubby vegetation. Loose scree makes footing treacherous. The trail head is SOUTH. The ridge top is UP.',
        exits: { s: 'trail', u: 'ridge_top' },
        look: {}
      },
      ridge_top: {
        name: 'Ridge Top',
        desc: 'A panoramic viewpoint. The valley spreads below — you can see your camp, the stream, and the road-cut outcrop. To the NORTH, folded strata are exposed on a cliff face. Go DOWN to descend.',
        exits: { d: 'ridge_trail', n: 'fold_outcrop' },
        look: { valley: 'The regional structure becomes clear from up here. A broad syncline with the fold axis trending roughly NE-SW.', strata: 'The cliff to the north shows a spectacular fold. Worth a closer look.' }
      },
      fold_outcrop: {
        name: 'Fold Exposure',
        desc: 'A cliff face reveals a textbook asymmetric anticline. The folded layers of limestone and marl are clearly visible. The fold axis plunges gently to the northeast. The ridge is SOUTH.',
        exits: { s: 'ridge_top' },
        reading: [045, 60],
        look: { fold: 'A tight, asymmetric anticline with a steep southern limb and gentler northern limb. Parasitic folds visible on the steep limb.', limestone: 'Cream-colored micritic limestone. Occasional shell fragments — possibly Cretaceous.' }
      },
      mine_entrance: {
        name: 'Old Mine Entrance',
        desc: 'A timber-framed adit is cut into the hillside. A faded sign reads "SILBERBERGWERK — BETRETEN VERBOTEN". A rusty gate blocks the entrance. The trail is WEST.',
        exits: { w: 'trail' },
        gate: 'locked',
        look: { sign: '"Silver Mine — Entry Forbidden". Looks like it has been abandoned for over a century.', gate: 'A heavy iron gate, rusted but solid. There is a keyhole.' }
      },
      mine_tunnel: {
        name: 'Mine Tunnel',
        desc: 'A low tunnel cut through metamorphic rock. The walls glitter with mica. Old rail tracks run along the floor. The tunnel continues NORTH into darkness. The entrance is SOUTH.',
        exits: { s: 'mine_entrance', n: 'mine_dark' },
        look: { walls: 'Mica schist with well-developed foliation. Garnet porphyroblasts are visible — upper amphibolite facies at least.', tracks: 'Narrow-gauge rail tracks, heavily corroded. Ore carts must have run on these.' }
      },
      mine_dark: {
        name: 'Dark Passage',
        desc: 'It is pitch dark. You are likely to be eaten by a geologist\'s worst nightmare: an unfunded research proposal.',
        dark: true,
        descLit: 'The tunnel opens into a natural cavern. Quartz veins lace the walls, and in one corner, a geode has been split open, revealing perfect crystals. The tunnel is SOUTH. A narrow passage leads EAST.',
        exits: { s: 'mine_tunnel', e: 'mineral_chamber' },
        look: { veins: 'Hydrothermal quartz veins cutting through the schist. Some show multiple generations of mineralization.', geode: 'A spectacular geode about 30cm across. Amethyst and clear quartz crystals line the interior.' },
        hasCrystal: true
      },
      mineral_chamber: {
        name: 'Mineral Chamber',
        desc: 'A small natural chamber. The ceiling sparkles with tiny crystals. A narrow vein of galena crosses the far wall — this must be what the miners were after. An old wooden crate sits in the corner. The passage is WEST.',
        dark: true,
        descLit: 'A small natural chamber. The ceiling sparkles with tiny crystals. A narrow vein of galena crosses the far wall — this must be what the miners were after. An old wooden crate sits in the corner. The passage is WEST.',
        exits: { w: 'mine_dark' },
        reading: [220, 70],
        look: { galena: 'Lead sulfide — PbS. Classic cubic cleavage. The vein is about 15cm wide and runs roughly N-S.', crate: 'Old mining supplies. Nothing useful remains except a faded newspaper from 1923.', ceiling: 'Calcite and possibly some secondary minerals. Beautiful.' }
      }
    };

    state = {
      room: 'camp',
      inventory: ['lens'],
      readings: [],
      moves: 0,
      started: true,
      done: false,
      gateUnlocked: false,
      gotFossil: false,
      gotCrystal: false,
      gotSample: false
    };
  }

  function getRoom() { return rooms[state.room]; }

  function itemsHere() {
    var here = [];
    for (var id in items) {
      if (items[id].loc === state.room) here.push(id);
    }
    return here;
  }

  function hasItem(id) { return state.inventory.indexOf(id) >= 0; }

  function describeRoom() {
    var r = getRoom();
    var lines = ['\n' + r.name.toUpperCase()];
    if (r.dark && !hasItem('headlamp')) {
      lines.push(r.desc);
      return lines.join('\n');
    }
    lines.push(r.descLit || r.desc);
    var here = itemsHere();
    if (here.length > 0) {
      for (var i = 0; i < here.length; i++) {
        lines.push('  There is a ' + items[here[i]].name + ' here.');
      }
    }
    return lines.join('\n');
  }

  function doMove(dir) {
    var r = getRoom();
    if (r.dark && !hasItem('headlamp') && dir !== 's') {
      return 'You stumble in the dark. Best go back SOUTH or find a light source.';
    }
    // Special: mine gate
    if (state.room === 'mine_entrance' && dir === 'n') {
      if (!state.gateUnlocked) {
        return 'The iron gate is locked. You need a key.';
      }
      state.room = 'mine_tunnel';
      state.moves++;
      return describeRoom();
    }
    if (!r.exits[dir]) return 'You can\'t go that way.';
    state.room = r.exits[dir];
    state.moves++;
    return describeRoom();
  }

  function doTake(what) {
    if (!what) return 'Take what?';
    // Special: fossil
    if ((what === 'fossil' || what === 'trilobite') && getRoom().hasFossil && !state.gotFossil) {
      if (!hasItem('hammer')) return 'The fossil is embedded in the shale. You need something to split the rock.';
      state.gotFossil = true;
      items.fossil.loc = 'inventory';
      state.inventory.push('fossil');
      return 'You carefully split the shale with your hammer. A perfect trilobite! Taken.';
    }
    // Special: crystal
    if ((what === 'crystal' || what === 'quartz') && rooms.mine_dark.hasCrystal && state.room === 'mine_dark' && !state.gotCrystal) {
      state.gotCrystal = true;
      items.crystal.loc = 'inventory';
      state.inventory.push('crystal');
      return 'You carefully extract a perfect quartz crystal from the geode. Taken.';
    }
    // Special: sample at outcrop
    if ((what === 'sample' || what === 'rock') && state.room === 'outcrop_face' && !state.gotSample) {
      if (!hasItem('hammer')) return 'You can\'t break off a sample with your bare hands. You need a hammer.';
      state.gotSample = true;
      items.sample.loc = 'inventory';
      state.inventory.push('sample');
      return 'You hammer off a clean sample of the arkosic sandstone. Taken.';
    }
    var here = itemsHere();
    for (var i = 0; i < here.length; i++) {
      var id = here[i];
      if (id === what || items[id].name.toLowerCase().indexOf(what) >= 0) {
        items[id].loc = 'inventory';
        state.inventory.push(id);
        return items[id].name + ' taken.';
      }
    }
    return 'You don\'t see that here.';
  }

  function doDrop(what) {
    if (!what) return 'Drop what?';
    for (var i = 0; i < state.inventory.length; i++) {
      var id = state.inventory[i];
      if (id === what || items[id].name.toLowerCase().indexOf(what) >= 0) {
        state.inventory.splice(i, 1);
        items[id].loc = state.room;
        return items[id].name + ' dropped.';
      }
    }
    return 'You\'re not carrying that.';
  }

  function doExamine(what) {
    if (!what) return 'Examine what?';
    // Check inventory first
    for (var i = 0; i < state.inventory.length; i++) {
      var id = state.inventory[i];
      if (id === what || items[id].name.toLowerCase().indexOf(what) >= 0) {
        return items[id].desc;
      }
    }
    // Check items here
    var here = itemsHere();
    for (var j = 0; j < here.length; j++) {
      var hid = here[j];
      if (hid === what || items[hid].name.toLowerCase().indexOf(what) >= 0) {
        return items[hid].desc;
      }
    }
    // Check room look targets
    var r = getRoom();
    if (r.look && r.look[what]) return r.look[what];
    return 'You don\'t see anything special.';
  }

  function doUse(what) {
    if (!what) return 'Use what?';
    if (what === 'compass' || what === 'clar') {
      if (!hasItem('compass')) return 'You don\'t have a compass.';
      var r = getRoom();
      if (!r.reading) return 'There\'s nothing suitable to measure here.';
      if (r.dark && !hasItem('headlamp')) return 'You can\'t read the compass in the dark.';
      var dd = r.reading[0], dip = r.reading[1];
      var readingStr = String(dd).padStart(3, '0') + '/' + String(dip).padStart(2, '0');
      // Check if already recorded
      for (var i = 0; i < state.readings.length; i++) {
        if (state.readings[i][0] === dd && state.readings[i][1] === dip) {
          return 'Compass reads: ' + readingStr + ' (dip direction/dip). You\'ve already recorded this one.';
        }
      }
      if (hasItem('notebook')) {
        state.readings.push([dd, dip]);
        var out = 'Compass reads: ' + readingStr + ' (dip direction/dip). Recorded in notebook. (' + state.readings.length + '/3)';
        if (state.readings.length >= 3) {
          out += '\n\nYou have enough readings. Head back to camp to transcribe them to OS\u00B2!';
        }
        return out;
      }
      return 'Compass reads: ' + readingStr + ' (dip direction/dip). You should write this down — do you have a notebook?';
    }
    if (what === 'key') {
      if (!hasItem('key')) return 'You don\'t have a key.';
      if (state.room !== 'mine_entrance') return 'There\'s nothing to unlock here.';
      if (state.gateUnlocked) return 'The gate is already unlocked.';
      state.gateUnlocked = true;
      rooms.mine_entrance.exits.n = 'mine_tunnel';
      return 'The rusty key turns with a grinding screech. The gate swings open. You can now go NORTH into the mine.';
    }
    if (what === 'notebook') {
      if (!hasItem('notebook')) return 'You don\'t have it.';
      if (state.readings.length === 0) return 'The notebook has old readings from previous field days, but nothing from today. Use your compass at outcrops to take measurements.';
      var lines = 'Today\'s readings:';
      for (var ri = 0; ri < state.readings.length; ri++) {
        lines += '\n  ' + (ri + 1) + '. ' + String(state.readings[ri][0]).padStart(3, '0') + '/' + String(state.readings[ri][1]).padStart(2, '0');
      }
      return lines;
    }
    if (what === 'laptop' || what === 'os2' || what === 'osos') {
      if (state.room !== 'camp') return 'The laptop is back at camp.';
      if (state.readings.length < 3) return 'OS\u00B2 is running, but you need at least 3 field readings to submit your data. Keep measuring!';
      state.done = true;
      if (plotCallback) plotCallback(state.readings);
      return 'You type your ' + state.readings.length + ' readings into OS\u00B2...\n\n' +
        'The stereonet plots your field data. Check it out!\n\n' +
        '\u2605 FIELD DAY COMPLETE \u2605\n' +
        'Readings: ' + state.readings.length + '/3 | Moves: ' + state.moves + '\n' +
        (state.gotFossil ? '  \u2713 Found the trilobite\n' : '') +
        (state.gotCrystal ? '  \u2713 Found the quartz crystal\n' : '') +
        (state.gotSample ? '  \u2713 Collected a rock sample\n' : '') +
        (state.gateUnlocked ? '  \u2713 Explored the old mine\n' : '') +
        '\nAlles Clar? Type QUIT to return to OS\u00B2.';
    }
    if (what === 'hammer') {
      if (!hasItem('hammer')) return 'You don\'t have a hammer.';
      return 'You swing the hammer experimentally. Satisfying heft. Try TAKE SAMPLE or TAKE FOSSIL at the right outcrops.';
    }
    if (what === 'lens' || what === 'hand lens') {
      if (!hasItem('lens')) return 'You don\'t have it.';
      var lr = getRoom();
      if (lr.reading || lr.hasFossil || lr.hasCrystal) return 'You peer through the lens at the rock. Grain boundaries and mineral textures snap into focus. Beautiful.';
      return 'Nothing particularly interesting to examine closely here.';
    }
    if (what === 'headlamp' || what === 'lamp') {
      if (!hasItem('headlamp')) return 'You don\'t have it.';
      return 'The headlamp is on your head, lighting the way. It works automatically in dark areas.';
    }
    return 'You can\'t use that.';
  }

  function doInventory() {
    if (state.inventory.length === 0) return 'You are empty-handed.';
    var lines = 'You are carrying:';
    for (var i = 0; i < state.inventory.length; i++) {
      lines += '\n  ' + items[state.inventory[i]].name;
    }
    return lines;
  }

  function doHelp() {
    return 'Commands:\n' +
      '  N/S/E/W/U/D  - move (or NORTH, SOUTH, etc.)\n' +
      '  LOOK          - look around\n' +
      '  LOOK <thing>  - examine something in the room\n' +
      '  TAKE <item>   - pick up an item\n' +
      '  DROP <item>   - drop an item\n' +
      '  USE <item>    - use an item\n' +
      '  EXAMINE <item>- examine an item you carry\n' +
      '  INVENTORY     - list what you carry\n' +
      '  READINGS      - review today\'s compass readings\n' +
      '  QUIT          - return to OS\u00B2 console';
  }

  function command(input) {
    if (!state.started) return '';
    if (state.done) {
      if (input === 'quit' || input === 'q') return null;
      return 'Your field day is done! Type QUIT to return to OS\u00B2.';
    }
    var parts = input.toLowerCase().trim().split(/\s+/);
    var cmd = parts[0];
    var arg = parts.slice(1).join(' ');

    var dirs = { n:'n', north:'n', s:'s', south:'s', e:'e', east:'e', w:'w', west:'w', u:'u', up:'u', d:'d', down:'d' };

    if (dirs[cmd]) return doMove(dirs[cmd]);
    if (cmd === 'go' && dirs[arg]) return doMove(dirs[arg]);

    switch (cmd) {
      case 'quit': case 'q': return null;
      case 'look': case 'l':
        if (arg) return doExamine(arg);
        return describeRoom();
      case 'take': case 'get': case 'grab': case 'pick':
        return doTake(arg);
      case 'drop': return doDrop(arg);
      case 'use': return doUse(arg);
      case 'examine': case 'x': case 'inspect':
        return doExamine(arg);
      case 'inventory': case 'inv': case 'i':
        return doInventory();
      case 'readings':
        return doUse('notebook');
      case 'help': case '?':
        return doHelp();
      case 'xyzzy':
        return 'A hollow voice says "Try measuring the fold exposure."';
      default:
        return 'I don\'t understand "' + cmd + '". Type HELP for commands.';
    }
  }

  function start() {
    init();
    return '  \u2584\u2584\u2584  GEOLOGICAL ADVENTURE  \u2584\u2584\u2584\n' +
      '  A text adventure for OS\u00B2\n\n' +
      'You are a geology student on a field mapping day.\n' +
      'Your task: take compass readings at three outcrops\n' +
      'and bring them back to camp for analysis in OS\u00B2.\n\n' +
      'You have your trusty hand lens. The rest of your\n' +
      'gear should be around camp somewhere.\n\n' +
      'Type HELP for commands.\n' +
      describeRoom();
  }

  var plotCallback = null;

  window.AdventureGame = {
    start: start,
    command: command,
    isOver: function() { return state && state.done; },
    onPlot: function(cb) { plotCallback = cb; }
  };
})();
