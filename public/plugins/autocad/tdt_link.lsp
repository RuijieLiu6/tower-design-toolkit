;;; Tower Design Toolkit link for AutoCAD (2015 and later, Windows; full AutoCAD, not LT).
;;;
;;; Writes the drawing's 3D model as an OBJ file next to the drawing (<drawing>_toolkit.obj): now, and again after
;;; every save while the link is on. In the Tower Design Toolkit, "Link the file" once (Chrome or Edge): the model then
;;; updates by itself after each save, with the layer-to-role mapping you chose the first time. Nothing is uploaded.
;;;
;;; Load: type APPLOAD, pick this file (add it to the Startup Suite to keep it). Then:
;;;   TDTLINK  write the OBJ now and after every save
;;;   TDTSEND  write it now (also what TDTLINK runs after a save)
;;;   TDTSTOP  stop writing after saves
;;;
;;; What it writes: 3D solids, surfaces, polyface and polygon meshes (each converted on a temporary copy to a mesh
;;; without smoothing, read, then deleted), mesh objects and 3D faces, in model space, on layers that are on and thawed.
;;; Blocks are not opened: explode them, or keep the massing outside blocks. One OBJ group per layer: name the layers
;;; Tower massing, Podium, Below grade, Landscape, Urban design, Context and Site boundary and the Toolkit maps them
;;; by itself. Units come from INSUNITS (metres in the file); an unset INSUNITS leaves the Toolkit to ask for them.
;;;
;;; Written by the Tower Design Toolkit team (UBC ARCH 540), MIT licence. Not yet tested inside AutoCAD (it was not
;;; installed where it was written): treat it as unverified and tell us what happens.

(vl-load-com)

(setq tdt:version "1.0")
(setq tdt:reactor nil)

(defun tdt:out-path ()
  (strcat (getvar "DWGPREFIX") (vl-filename-base (getvar "DWGNAME")) "_toolkit.obj"))

;; Drawing units to metres from INSUNITS (1 in, 2 ft, 4 mm, 5 cm, 6 m); nil when not set.
(defun tdt:scale (/ u)
  (setq u (getvar "INSUNITS"))
  (cond ((= u 1) 0.0254) ((= u 2) 0.3048) ((= u 4) 0.001) ((= u 5) 0.01) ((= u 6) 1.0) (t nil)))

(defun tdt:num (v) (rtos v 2 4))

;; Visible layer: on (colour positive) and not frozen.
(defun tdt:layer-shown (name / l)
  (setq l (tblsearch "LAYER" name))
  (and l (> (cdr (assoc 62 l)) 0) (= 0 (logand 1 (cdr (assoc 70 l))))))

;; A MESH entity's vertices and faces from its DXF data: ((x y z) ...) and ((i j k ...) ...), 0-based.
(defun tdt:mesh-data (ed / verts faces n m lst face k item)
  (setq lst ed)
  ;; vertices: 92 = count, then that many 10 groups
  (while (and lst (/= (caar lst) 92)) (setq lst (cdr lst)))
  (setq n (cdar lst) lst (cdr lst))
  (while (and lst (> n 0))
    (if (= (caar lst) 10) (setq verts (cons (cdar lst) verts) n (1- n)))
    (setq lst (cdr lst)))
  (setq verts (reverse verts))
  ;; faces: 93 = size of the face list, then that many 90 groups: a corner count, then the corners
  (while (and lst (/= (caar lst) 93)) (setq lst (cdr lst)))
  (setq m (cdar lst) lst (cdr lst))
  (while (and lst (> m 0))
    (if (= (caar lst) 90)
      (progn
        (setq item (cdar lst) m (1- m))
        (if (null k)
          (setq k item face nil)
          (setq face (cons item face) k (1- k)))
        (if (and k (= k 0)) (setq faces (cons (reverse face) faces) k nil))))
    (setq lst (cdr lst)))
  (list verts (reverse faces)))

;; Writes one group: its vertices (scaled) and triangles (fanned), with the running vertex base.
(defun tdt:write-group (f layer verts faces base s / i)
  (write-line (strcat "# tdt layer: " layer) f)
  (write-line (strcat "g " layer) f)
  (foreach p verts
    (write-line (strcat "v " (tdt:num (* s (car p))) " " (tdt:num (* s (cadr p))) " " (tdt:num (* s (caddr p)))) f))
  (foreach fc faces
    (if (>= (length fc) 3)
      (progn
        (setq i 1)
        (while (< (1+ i) (length fc))
          (write-line (strcat "f " (itoa (+ base 1 (car fc))) " " (itoa (+ base 1 (nth i fc))) " " (itoa (+ base 1 (nth (1+ i) fc)))) f)
          (setq i (1+ i))))))
  (+ base (length verts)))

(defun c:TDTSEND (/ path s unit f ss i e ed typ layer base copy new data cnt smooth echo)
  (setq path (tdt:out-path) s (tdt:scale) unit (if s "m" nil) s (if s s 1.0))
  (setq ss (ssget "_X" '((-4 . "<OR") (0 . "3DSOLID") (0 . "SURFACE") (0 . "PLANESURFACE") (0 . "EXTRUDEDSURFACE")
                          (0 . "LOFTEDSURFACE") (0 . "REVOLVEDSURFACE") (0 . "SWEPTSURFACE") (0 . "NURBSURFACE")
                          (0 . "MESH") (0 . "3DFACE") (0 . "POLYLINE") (-4 . "OR>") (410 . "Model"))))
  (if (null ss)
    (progn (princ "\nTower Design Toolkit: no 3D solids, surfaces or meshes in model space.") (princ))
    (progn
      (setq f (open path "w") base 0 cnt 0)
      (write-line (strcat "# Tower Design Toolkit link " tdt:version " (AutoCAD " (getvar "ACADVER") ")") f)
      (if unit (write-line "# tdt units: m" f))
      (write-line "# tdt up: z" f)
      (write-line (strcat "# tdt doc: " (getvar "DWGNAME")) f)
      (setq smooth (getvar "FACETERSMOOTHLEV") echo (getvar "CMDECHO"))
      (setvar "CMDECHO" 0)
      (setvar "FACETERSMOOTHLEV" 0) ; a mesh as faceted as the solid, no smoothing
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i) ed (entget e) typ (cdr (assoc 0 ed)) layer (cdr (assoc 8 ed)))
        (cond
          ((not (tdt:layer-shown layer)) nil)
          ((= typ "MESH")
           (setq data (tdt:mesh-data ed) base (tdt:write-group f layer (car data) (cadr data) base s) cnt (1+ cnt)))
          ((= typ "3DFACE")
           (setq base (tdt:write-group f layer (list (cdr (assoc 10 ed)) (cdr (assoc 11 ed)) (cdr (assoc 12 ed)) (cdr (assoc 13 ed)))
                                       (if (equal (cdr (assoc 12 ed)) (cdr (assoc 13 ed)) 1e-9) '((0 1 2)) '((0 1 2 3))) base s)
                 cnt (1+ cnt)))
          ((and (= typ "POLYLINE") (= 0 (logand 80 (cdr (assoc 70 ed))))) nil) ; a 2D or 3D polyline, not a mesh
          (t
           ;; Solids, surfaces and polyface meshes: a temporary copy becomes a mesh, is read, and is deleted.
           (setq copy (vla-copy (vlax-ename->vla-object e)) new nil)
           (if (not (vl-catch-all-error-p (vl-catch-all-apply 'vl-cmdf (list "_.MESHSMOOTH" (vlax-vla-object->ename copy) ""))))
             (setq new (entlast)))
           (if (and new (= (cdr (assoc 0 (entget new))) "MESH"))
             (setq data (tdt:mesh-data (entget new)) base (tdt:write-group f layer (car data) (cadr data) base s) cnt (1+ cnt)))
           (if (and new (entget new)) (entdel new))
           (if (and copy (not (vlax-erased-p copy))) (vla-delete copy))))
        (setq i (1+ i)))
      (setvar "FACETERSMOOTHLEV" smooth)
      (setvar "CMDECHO" echo)
      (close f)
      (princ (strcat "\nTower Design Toolkit: " (itoa cnt) " objects written to " path))))
  (princ))

;; After a save: run TDTSEND once the save command has finished (a reactor cannot run commands itself).
(defun tdt:after-save (reactor info)
  (vla-SendCommand (vla-get-ActiveDocument (vlax-get-acad-object)) "TDTSEND\n"))

(defun c:TDTLINK ()
  (if (null tdt:reactor)
    (setq tdt:reactor (vlr-dwg-reactor nil '((:vlr-saveComplete . tdt:after-save)))))
  (c:TDTSEND)
  (princ (strcat "\nTower Design Toolkit link " tdt:version ": on. The OBJ is written again after every save. In the Toolkit, Link the file " (tdt:out-path) " once. TDTSTOP stops it."))
  (princ))

(defun c:TDTSTOP ()
  (if tdt:reactor (progn (vlr-remove tdt:reactor) (setq tdt:reactor nil)))
  (princ "\nTower Design Toolkit link: off. TDTLINK turns it on again.")
  (princ))

(princ "\nTower Design Toolkit link loaded: type TDTLINK.")
(princ)
