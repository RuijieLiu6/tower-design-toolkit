# Tower Design Toolkit link for SketchUp (2017 and later, Windows and Mac).
#
# Serves the open SketchUp model to the Tower Design Toolkit in your browser, on this computer only
# (http://127.0.0.1:8797, or 8796, 8795). Nothing is uploaded. The Toolkit asks for the latest copy every second or
# two; after a change here it updates by itself, with the tag-to-role mapping you chose the first time.
#
# Start: Window > Ruby Console, then type (with the folder you saved this file in):
#     load 'C:/Users/you/Downloads/tdt_link.rb'
# A "Tower Design Toolkit" menu appears under Extensions: Start link, Send now, Instant sync (on/off), Stop link.
# To keep it, copy the file into SketchUp's Plugins folder (Extensions > Extension Manager shows where).
#
#   GET /tdt/rev        -> {"rev": 3, "doc": "Tower.skp", "objects": 412, "units": "Meters", ...}
#   GET /tdt/model.obj  -> the latest copy as OBJ in metres, z up, one group per tag (header X-TDT-Rev)
#
# Tags become the Toolkit's roles by name: Tower massing, Podium, Below grade, Landscape, Urban design, Context,
# Site boundary (any other tag can be mapped by hand). Faces on Untagged take the tag of the group or component
# they are in. Hidden faces and hidden tags are left out.
#
# Written by the Tower Design Toolkit team (UBC ARCH 540), MIT licence. Not yet tested inside SketchUp (it was not
# installed where it was written): treat it as unverified and tell us what happens.

require 'sketchup.rb'
require 'socket'
require 'json'

module TowerDesignToolkit
  module Link
    VERSION = '1.0'
    PORTS = [8797, 8796, 8795].freeze
    INCH = 0.0254 # SketchUp keeps lengths in inches
    SETTLE_S = 0.6
    ALLOWED_ORIGINS = ['https://ruijieliu6.github.io'].freeze
    LOCAL_PREFIXES = ['http://localhost:', 'http://127.0.0.1:', 'http://[::1]:'].freeze
    STATUS = { 200 => 'OK', 204 => 'No Content', 403 => 'Forbidden', 404 => 'Not Found', 503 => 'Service Unavailable' }.freeze

    @server = nil
    @port = nil
    @timer = nil
    @rev = 0
    @obj = nil
    @objects = 0
    @instant = true
    @changed_at = nil
    @model_watch = nil
    @app_watch = nil

    class << self
      attr_accessor :instant
    end

    def self.running?
      !@server.nil?
    end

    def self.say(text)
      puts "Tower Design Toolkit link: #{text}"
      Sketchup.status_text = "Tower Design Toolkit link: #{text}"
    end

    def self.start
      if running?
        UI.messagebox("The Tower Design Toolkit link is already running on http://127.0.0.1:#{@port}.\nIn the Toolkit, press Connect to SketchUp.")
        return
      end
      PORTS.each do |p|
        begin
          @server = TCPServer.new('127.0.0.1', p)
          @port = p
          break
        rescue StandardError
          @server = nil
        end
      end
      unless @server
        UI.messagebox('Tower Design Toolkit: ports 8797, 8796 and 8795 are all busy. Close the program using them and start the link again.')
        return
      end
      watch(Sketchup.active_model)
      @app_watch ||= AppWatch.new
      Sketchup.add_observer(@app_watch)
      @obj = nil
      @timer = UI.start_timer(0.15, true) { tick }
      say("running on http://127.0.0.1:#{@port}. In the Toolkit, press Connect to SketchUp.")
    end

    def self.stop
      UI.stop_timer(@timer) if @timer
      @timer = nil
      begin
        @server.close if @server
      rescue StandardError
        nil
      end
      @server = nil
      begin
        Sketchup.active_model.remove_observer(@model_watch) if @model_watch
        Sketchup.remove_observer(@app_watch) if @app_watch
      rescue StandardError
        nil
      end
      say('stopped. Start link (Extensions > Tower Design Toolkit) starts it again.')
    end

    def self.watch(model)
      @model_watch ||= ModelWatch.new
      model.add_observer(@model_watch) if model
    end

    def self.changed!
      @changed_at = Time.now
    end

    def self.send_now
      return start unless running?
      @changed_at = nil
      rebuild
      say("sent (copy #{@rev}).")
    end

    def self.toggle_instant
      @instant = !@instant
      say(@instant ? 'instant sync on: changes go to the Toolkit as you make them.' : 'instant sync off: changes wait here until you press Send now.')
    end

    # Rebuilds the copy when changes have settled (instant sync on), then answers whoever is waiting.
    def self.tick
      if @changed_at && @instant && Time.now - @changed_at > SETTLE_S
        @changed_at = nil
        rebuild
      end
      rebuild if @obj.nil?
      serve
    rescue StandardError => e
      say("problem: #{e.message}")
    end

    def self.rebuild
      ex = Exporter.new(Sketchup.active_model)
      @obj = ex.obj
      @objects = ex.count
      @rev += 1
    end

    def self.doc_name
      path = Sketchup.active_model.path.to_s
      path.empty? ? 'Untitled.skp' : File.basename(path)
    end

    def self.origin_allowed?(origin)
      return true if origin.nil? || origin.empty? # not a browser page
      ALLOWED_ORIGINS.include?(origin) || LOCAL_PREFIXES.any? { |p| origin.start_with?(p) }
    end

    # Answers every request waiting, without ever blocking SketchUp for long.
    def self.serve
      loop do
        begin
          client = @server.accept_nonblock
        rescue IO::WaitReadable, Errno::EINTR
          return
        end
        handle(client)
      end
    end

    def self.read_request(client)
      buf = ''.dup
      deadline = Time.now + 0.5
      until buf.include?("\r\n\r\n") || Time.now > deadline
        next unless IO.select([client], nil, nil, 0.1)
        chunk = begin
          client.readpartial(4096)
        rescue EOFError
          nil
        end
        break if chunk.nil?
        buf << chunk
      end
      buf
    end

    def self.handle(client)
      req = read_request(client)
      method, path = req.lines.first.to_s.split(' ')
      path = (path || '/').split('?').first
      origin = req[/^Origin:\s*(.+?)\r?$/i, 1]
      return reply(client, 403, 'text/plain', 'origin not allowed', origin) unless origin_allowed?(origin)
      if method == 'OPTIONS'
        reply(client, 204, 'text/plain', '', origin)
      elsif path == '/tdt/rev'
        body = JSON.generate({ 'rev' => @rev, 'doc' => doc_name, 'objects' => @objects, 'units' => 'Meters', 'port' => @port,
                               'version' => VERSION, 'app' => 'sketchup', 'instant' => @instant, 'pending' => @changed_at ? 1 : 0 })
        reply(client, 200, 'application/json', body, origin)
      elsif path == '/tdt/model.obj'
        if @obj
          reply(client, 200, 'text/plain; charset=utf-8', @obj, origin, @rev)
        else
          reply(client, 503, 'text/plain', 'the first copy is still being written', origin)
        end
      elsif path == '/' || path == '/tdt'
        reply(client, 200, 'text/plain; charset=utf-8', "Tower Design Toolkit link #{VERSION} for SketchUp is running. Open the Toolkit and press Connect to SketchUp.", origin)
      else
        reply(client, 404, 'text/plain', 'not found', origin)
      end
    rescue StandardError => e
      say("a request failed: #{e.message}")
    ensure
      begin
        client.close
      rescue StandardError
        nil
      end
    end

    def self.reply(client, code, ctype, body, origin, rev = nil)
      data = body.to_s.dup.force_encoding('BINARY')
      head = ["HTTP/1.1 #{code} #{STATUS[code] || 'OK'}", "Content-Type: #{ctype}", "Content-Length: #{data.bytesize}", 'Cache-Control: no-store', 'Connection: close']
      if origin && !origin.empty? && origin_allowed?(origin)
        head += ["Access-Control-Allow-Origin: #{origin}", 'Vary: Origin', 'Access-Control-Allow-Methods: GET, OPTIONS',
                 'Access-Control-Allow-Headers: *', 'Access-Control-Expose-Headers: X-TDT-Rev',
                 # Chrome's Private Network Access: a public page may reach this local server.
                 'Access-Control-Allow-Private-Network: true']
      end
      head << "X-TDT-Rev: #{rev}" if rev
      client.write(head.join("\r\n") + "\r\n\r\n" + data)
    end

    # The model as OBJ: metres, z up, faces fanned into triangles, one group per tag.
    class Exporter
      attr_reader :count

      def initialize(model)
        @model = model
        @groups = {}
        @count = 0
      end

      def obj
        walk(@model.entities, Geom::Transformation.new, nil)
        out = []
        out << "# Tower Design Toolkit link #{VERSION} (SketchUp #{Sketchup.version})"
        out << '# tdt units: m'
        out << '# tdt up: z'
        out << "# tdt doc: #{Link.doc_name}"
        base = 0
        @groups.each do |tag, g|
          out << "# tdt layer: #{tag}"
          out << "g #{tag}"
          g[:v].each { |p| out << format('v %.4f %.4f %.4f', p[0], p[1], p[2]) }
          g[:f].each { |f| out << "f #{f[0] + base + 1} #{f[1] + base + 1} #{f[2] + base + 1}" }
          base += g[:v].length
        end
        out.join("\n") + "\n"
      end

      private

      def visible?(e)
        return false if e.respond_to?(:hidden?) && e.hidden?
        return false if e.respond_to?(:layer) && e.layer && !e.layer.visible?
        true
      end

      def tag_of(e, inherited)
        name = e.respond_to?(:layer) && e.layer ? e.layer.name : nil
        # Untagged faces take the tag of the group or component they sit in, as SketchUp draws them.
        return(inherited || 'Untagged') if name.nil? || name == 'Layer0' || name == 'Untagged'
        name
      end

      def walk(entities, tr, inherited)
        entities.each do |e|
          next unless visible?(e)
          case e
          when Sketchup::Face
            add_face(e, tr, tag_of(e, inherited))
          when Sketchup::Group
            walk(e.entities, tr * e.transformation, tag_of(e, inherited))
          when Sketchup::ComponentInstance
            walk(e.definition.entities, tr * e.transformation, tag_of(e, inherited))
          end
        end
      end

      def add_face(face, tr, tag)
        mesh = face.mesh(0)
        g = (@groups[tag] ||= { v: [], f: [] })
        off = g[:v].length
        (1..mesh.count_points).each do |i|
          p = tr * mesh.point_at(i)
          g[:v] << [p.x.to_f * INCH, p.y.to_f * INCH, p.z.to_f * INCH]
        end
        mesh.polygons.each do |poly|
          idx = poly.map { |i| i.abs - 1 + off }
          next if idx.length < 3
          (1...(idx.length - 1)).each { |k| g[:f] << [idx[0], idx[k], idx[k + 1]] }
        end
        @count += 1
      end
    end

    # Any committed edit, undo or redo is a change.
    class ModelWatch < Sketchup::ModelObserver
      def onTransactionCommit(_model)
        Link.changed!
      end

      def onTransactionUndo(_model)
        Link.changed!
      end

      def onTransactionRedo(_model)
        Link.changed!
      end
    end

    # A new or opened model: watch it, and send it.
    class AppWatch < Sketchup::AppObserver
      def onNewModel(model)
        Link.watch(model)
        Link.changed!
      end

      def onOpenModel(model)
        Link.watch(model)
        Link.changed!
      end
    end

    unless file_loaded?(__FILE__)
      menu = UI.menu('Extensions').add_submenu('Tower Design Toolkit')
      menu.add_item('Start link') { Link.start }
      menu.add_item('Send now') { Link.send_now }
      item = menu.add_item('Instant sync') { Link.toggle_instant }
      menu.set_validation_proc(item) { Link.instant ? MF_CHECKED : MF_UNCHECKED }
      menu.add_item('Stop link') { Link.stop }
      file_loaded(__FILE__)
    end
  end
end

# Loading the file starts the link.
TowerDesignToolkit::Link.start
