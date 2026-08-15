-- Contract validator and native Pixelorama project writer for Epic 13.
-- Validate: lua docs/art/scripts/validate-builders.lua
-- Build:    lua docs/art/scripts/validate-builders.lua --write
--
-- The seven drawing files use a deliberately tiny pixel API. This runner checks
-- their contracts and can package their cels, layers, and tags as Pixelorama
-- 1.2 .pxo files. Pixelorama itself remains the authority for PNG/JSON export.

local realDofile = dofile
local activeSprite = nil
local writeProjects = arg[1] == "--write"

local function assertEqual(actual, expected, message)
  if actual ~= expected then
    error(string.format("%s: expected %s, got %s", message, tostring(expected), tostring(actual)))
  end
end

local function image(width, height)
  local pixels = {}
  return {
    width = width,
    height = height,
    pixels = pixels,
    drawPixel = function(self, x, y, color)
      local key = tostring(math.floor(x)) .. "," .. tostring(math.floor(y))
      if color == 0 then pixels[key] = nil else pixels[key] = color end
    end,
    clear = function(self)
      for key in pairs(pixels) do pixels[key] = nil end
    end,
  }
end

local function celCountPixels(cel)
  local count = 0
  for _ in pairs(cel.image.pixels) do count = count + 1 end
  return count
end

local function makeSprite(width, height)
  local sprite = {
    width = width,
    height = height,
    frames = {},
    layers = {},
    cels = {},
    tags = {},
    savedAs = nil,
  }

  local function addFrame()
    local frame = { frameNumber = #sprite.frames + 1 }
    table.insert(sprite.frames, frame)
    return frame
  end

  local function addLayer(name)
    local layer = { name = name, isVisible = true, cels = {} }
    function layer:cel(frame)
      local frameNumber = type(frame) == "table" and frame.frameNumber or frame
      return self.cels[frameNumber]
    end
    table.insert(sprite.layers, layer)
    return layer
  end

  addFrame()
  local body = addLayer("Layer 1")

  function sprite:newEmptyFrame()
    return addFrame()
  end

  function sprite:newLayer()
    return addLayer("Layer " .. tostring(#self.layers + 1))
  end

  function sprite:newCel(layer, frameNumber)
    local frame = type(frameNumber) == "table" and frameNumber or self.frames[frameNumber]
    local cel = { layer = layer, frame = frame, frameNumber = frame.frameNumber,
      image = image(self.width, self.height) }
    layer.cels[frame.frameNumber] = cel
    table.insert(self.cels, cel)
    return cel
  end

  function sprite:newTag(fromFrame, toFrame)
    local tag = { fromFrame = fromFrame, toFrame = toFrame, name = "" }
    table.insert(self.tags, tag)
    return tag
  end

  function sprite:saveAs(path)
    self.savedAs = path
  end

  sprite:newCel(body, 1)
  activeSprite = sprite
  return sprite
end

app = {
  pixelColor = {
    rgba = function(r, g, b, a)
      if a == 0 then return 0 end
      return r * 16777216 + g * 65536 + b * 256 + a
    end,
  },
  fs = { currentPath = "." },
}

Rectangle = function(x, y, width, height)
  return { x = x, y = y, width = width, height = height }
end

Sprite = makeSprite

local contracts = {
  {
    script = "docs/art/scripts/build-scrap-tabby.lua",
    width = 48, height = 48, frames = 16,
    layers = { "body", "face", "outfit", "weapon", "shadow", "notes" },
    hidden = { weapon = true, shadow = true, notes = true },
    populated = { "body", "face", "outfit", "notes" },
    tags = { idle = { 1, 4 }, run = { 5, 10 }, hurt = { 11, 12 }, defeat = { 13, 16 } },
    savedAs = "assets-src/characters/scrap-tabby/source/scrap-tabby.pxo",
  },
  {
    script = "docs/art/scripts/build-bolt-hound.lua",
    width = 48, height = 48, frames = 16,
    layers = { "body", "face", "outfit", "weapon", "shadow", "notes" },
    hidden = { weapon = true, shadow = true, notes = true },
    populated = { "body", "face", "outfit", "notes" },
    tags = { idle = { 1, 4 }, run = { 5, 10 }, hurt = { 11, 12 }, defeat = { 13, 16 } },
    savedAs = "assets-src/characters/bolt-hound/source/bolt-hound.pxo",
  },
  {
    script = "docs/art/scripts/build-dust-mite.lua",
    width = 48, height = 48, frames = 16,
    layers = { "body", "face", "notes" }, hidden = { notes = true },
    populated = { "body", "face", "notes" },
    tags = { idle = { 1, 4 }, run = { 5, 10 }, hurt = { 11, 12 }, defeat = { 13, 16 } },
    savedAs = "assets-src/enemies/dust-mite/source/dust-mite.pxo",
  },
  {
    script = "docs/art/scripts/build-junk-rusher.lua",
    width = 48, height = 48, frames = 16,
    layers = { "body", "face", "notes" }, hidden = { notes = true },
    populated = { "body", "face", "notes" },
    tags = { idle = { 1, 4 }, run = { 5, 10 }, hurt = { 11, 12 }, defeat = { 13, 16 } },
    savedAs = "assets-src/enemies/junk-rusher/source/junk-rusher.pxo",
  },
  {
    script = "docs/art/scripts/build-trash-brute.lua",
    width = 48, height = 48, frames = 16,
    layers = { "body", "face", "notes" }, hidden = { notes = true },
    populated = { "body", "face", "notes" },
    tags = { idle = { 1, 4 }, run = { 5, 10 }, hurt = { 11, 12 }, defeat = { 13, 16 } },
    savedAs = "assets-src/enemies/trash-brute/source/trash-brute.pxo",
  },
  {
    script = "docs/art/scripts/build-scrap-shot.lua",
    width = 16, height = 16, frames = 2,
    layers = { "body", "notes" }, hidden = { notes = true }, populated = { "body" },
    tags = { fly = { 1, 2 } },
    savedAs = "assets-src/projectiles/scrap-shot/source/scrap-shot.pxo",
  },
  {
    script = "docs/art/scripts/build-xp-mote.lua",
    width = 16, height = 16, frames = 4,
    layers = { "body", "notes" }, hidden = { notes = true }, populated = { "body" },
    tags = { idle = { 1, 4 } },
    savedAs = "assets-src/pickups/xp-mote/source/xp-mote.pxo",
  },
}

local weaponFamilies = { "pistol", "smg", "shotgun" }
for _, family in ipairs(weaponFamilies) do
  for tier = 1, 3 do
    for _, presentation in ipairs({
      { kind = "icon", directory = "weapon-icons", width = 32, height = 20 },
      { kind = "held", directory = "held-weapons", width = 32, height = 20 },
    }) do
      local id = string.format("weapon-%s-%s-t%d", presentation.kind, family, tier)
      table.insert(contracts, {
        script = "docs/art/scripts/build-" .. id .. ".lua",
        width = presentation.width, height = presentation.height, frames = 1,
        layers = { "body", "notes" }, hidden = { notes = true }, populated = { "body" },
        tags = {},
        savedAs = string.format("assets-src/%s/%s/source/%s.pxo", presentation.directory, id, id),
      })
    end
  end
  local id = "projectile-" .. family
  table.insert(contracts, {
    script = "docs/art/scripts/build-" .. id .. ".lua",
    width = 16, height = 16, frames = 2,
    layers = { "body", "notes" }, hidden = { notes = true }, populated = { "body" },
    tags = { fly = { 1, 2 } },
    savedAs = string.format("assets-src/projectiles/%s/source/%s.pxo", id, id),
  })
end

for _, kind in ipairs({ "scrap", "chest", "weapon" }) do
  local id = "drop-" .. kind
  table.insert(contracts, {
    script = "docs/art/scripts/build-" .. id .. ".lua",
    width = 20, height = 20, frames = 4,
    layers = { "body", "notes" }, hidden = { notes = true }, populated = { "body" },
    tags = { idle = { 1, 4 } },
    savedAs = string.format("assets-src/pickups/%s/source/%s.pxo", id, id),
  })
end

local function layerMap(sprite)
  local result = {}
  for _, layer in ipairs(sprite.layers) do result[layer.name] = layer end
  return result
end

local function tagMap(sprite)
  local result = {}
  for _, tag in ipairs(sprite.tags) do result[tag.name] = tag end
  return result
end

local function shellQuote(value)
  return "'" .. value:gsub("'", "'\\''") .. "'"
end

local function jsonString(value)
  return '"' .. value:gsub('[%z\1-\31\\"]', function(char)
    local escapes = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b',
      ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
    return escapes[char] or string.format("\\u%04x", char:byte())
  end) .. '"'
end

local function json(value)
  local kind = type(value)
  if kind == "nil" then return "null" end
  if kind == "boolean" or kind == "number" then return tostring(value) end
  if kind == "string" then return jsonString(value) end
  if kind ~= "table" then error("Cannot encode " .. kind .. " as JSON") end

  local isArray = #value > 0
  if isArray then
    local parts = {}
    for index = 1, #value do parts[index] = json(value[index]) end
    return "[" .. table.concat(parts, ",") .. "]"
  end

  local keys = {}
  for key in pairs(value) do table.insert(keys, key) end
  table.sort(keys)
  local parts = {}
  for _, key in ipairs(keys) do
    table.insert(parts, jsonString(key) .. ":" .. json(value[key]))
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

local function run(command)
  local ok, why, code = os.execute(command)
  if not ok then
    error(string.format("Command failed (%s %s): %s", tostring(why), tostring(code), command))
  end
end

local function writeFile(path, contents)
  local file = assert(io.open(path, "wb"))
  assert(file:write(contents))
  assert(file:close())
end

local function rawRgba(sprite, layer, frameNumber)
  local cel = layer:cel(frameNumber)
  local pixels = cel and cel.image.pixels or {}
  local bytes = {}
  for y = 0, sprite.height - 1 do
    for x = 0, sprite.width - 1 do
      local color = pixels[tostring(x) .. "," .. tostring(y)] or 0
      bytes[#bytes + 1] = string.char(
        math.floor(color / 16777216) % 256,
        math.floor(color / 65536) % 256,
        math.floor(color / 256) % 256,
        color % 256
      )
    end
  end
  return table.concat(bytes)
end

local function writePixeloramaProject(sprite)
  local layers = {}
  for _, layer in ipairs(sprite.layers) do
    layers[#layers + 1] = {
      name = layer.name, visible = layer.isVisible, locked = false,
      blend_mode = 0, clipping_mask = false, opacity = 1, parent = -1,
      effects = {}, animated_params = "{}", type = 0, new_cels_linked = false,
    }
  end

  local frames = {}
  for frameNumber = 1, #sprite.frames do
    local cels = {}
    for _ = 1, #sprite.layers do
      cels[#cels + 1] = { opacity = 1, z_index = 0, ui_color = "(0.0, 0.0, 0.0, 0.0)" }
    end
    frames[#frames + 1] = { cels = cels, duration = 1 }
  end

  local tags = {}
  for _, tag in ipairs(sprite.tags) do
    tags[#tags + 1] = {
      name = tag.name, color = "62a0eaff",
      from = tag.fromFrame, to = tag.toFrame,
    }
  end

  local project = {
    pixelorama_version = "v1.2-stable", pxo_version = 7,
    size_x = sprite.width, size_y = sprite.height, color_mode = 5,
    layers = layers, frames = frames, tags = tags,
    current_frame = 0, current_layer = 0, fps = 8,
    export_directory_path = assert(sprite.savedAs:match("^(.*)/[^/]+$")),
    export_file_name = sprite.savedAs:match("([^/]+)%.pxo$"),
    export_file_format = 0,
  }

  local tempRoot = assert(os.tmpname()):gsub("/+$", "") .. "-pixelorama"
  local targetDirectory = assert(sprite.savedAs:match("^(.*)/[^/]+$"))
  run("mkdir -p " .. shellQuote(tempRoot .. "/image_data/frames"))
  run("mkdir -p " .. shellQuote(targetDirectory))
  writeFile(tempRoot .. "/data.json", json(project))
  writeFile(tempRoot .. "/mimetype", "application/x-pixelorama")

  for frameNumber = 1, #sprite.frames do
    local frameDirectory = string.format("%s/image_data/frames/%d", tempRoot, frameNumber)
    run("mkdir -p " .. shellQuote(frameDirectory))
    for layerNumber, layer in ipairs(sprite.layers) do
      writeFile(string.format("%s/layer_%d", frameDirectory, layerNumber),
        rawRgba(sprite, layer, frameNumber))
    end
  end

  run("find " .. shellQuote(tempRoot) .. " -exec touch -t 202001010000 {} +")
  run("rm -f " .. shellQuote(sprite.savedAs))
  local absoluteTarget = assert(io.popen("pwd", "r")):read("*l") .. "/" .. sprite.savedAs
  run("cd " .. shellQuote(tempRoot) .. " && zip -q -X -r " .. shellQuote(absoluteTarget) ..
    " data.json mimetype image_data")
  run("rm -rf " .. shellQuote(tempRoot))
  io.write("WROTE ", sprite.savedAs, "\n")
end

local function writePreview(sprite, path)
  local columns = math.min(8, #sprite.frames)
  local rows = math.ceil(#sprite.frames / columns)
  local scale = (sprite.width == 16) and 12 or 4
  local width = columns * sprite.width * scale
  local height = rows * sprite.height * scale
  local background = { 16, 24, 32 }
  local composite = {}

  for frameNumber = 1, #sprite.frames do
    local framePixels = {}
    for _, layer in ipairs(sprite.layers) do
      if layer.isVisible then
        local cel = layer:cel(frameNumber)
        if cel then
          for key, color in pairs(cel.image.pixels) do framePixels[key] = color end
        end
      end
    end
    local column = (frameNumber - 1) % columns
    local row = math.floor((frameNumber - 1) / columns)
    for key, color in pairs(framePixels) do
      local comma = assert(key:find(",", 1, true))
      local x = tonumber(key:sub(1, comma - 1))
      local y = tonumber(key:sub(comma + 1))
      local r = math.floor(color / 16777216) % 256
      local g = math.floor(color / 65536) % 256
      local b = math.floor(color / 256) % 256
      for sy = 0, scale - 1 do
        for sx = 0, scale - 1 do
          local outputX = column * sprite.width * scale + x * scale + sx
          local outputY = row * sprite.height * scale + y * scale + sy
          composite[outputY * width + outputX] = { r, g, b }
        end
      end
    end
  end

  local file = assert(io.open(path, "wb"))
  file:write(string.format("P6\n%d %d\n255\n", width, height))
  for index = 0, width * height - 1 do
    local color = composite[index] or background
    file:write(string.char(color[1], color[2], color[3]))
  end
  file:close()
end

for _, contract in ipairs(contracts) do
  activeSprite = nil
  realDofile(contract.script)
  local sprite = assert(activeSprite, contract.script .. " did not create a sprite")
  assertEqual(sprite.width, contract.width, contract.script .. " width")
  assertEqual(sprite.height, contract.height, contract.script .. " height")
  assertEqual(#sprite.frames, contract.frames, contract.script .. " frame count")
  assertEqual(#sprite.layers, #contract.layers, contract.script .. " layer count")
  assertEqual(sprite.savedAs, contract.savedAs, contract.script .. " save path")

  local layers = layerMap(sprite)
  for _, name in ipairs(contract.layers) do
    assert(layers[name], contract.script .. " missing layer " .. name)
  end
  for name in pairs(contract.hidden) do
    assertEqual(layers[name].isVisible, false, contract.script .. " hidden layer " .. name)
  end
  for _, name in ipairs(contract.populated) do
    for frame = 1, contract.frames do
      local cel = layers[name]:cel(frame)
      assert(cel, string.format("%s missing cel %s/%d", contract.script, name, frame))
      assert(celCountPixels(cel) > 0,
        string.format("%s blank cel %s/%d", contract.script, name, frame))
    end
  end

  local tags = tagMap(sprite)
  local expectedTagCount = 0
  for name, range in pairs(contract.tags) do
    expectedTagCount = expectedTagCount + 1
    local tag = assert(tags[name], contract.script .. " missing tag " .. name)
    assertEqual(tag.fromFrame, range[1], contract.script .. " tag start " .. name)
    assertEqual(tag.toFrame, range[2], contract.script .. " tag end " .. name)
  end
  assertEqual(#sprite.tags, expectedTagCount, contract.script .. " tag count")
  if writeProjects then writePixeloramaProject(sprite) end
  io.write("PASS ", contract.script, "\n")
end

io.write("All visual-art builder contracts passed.\n")
