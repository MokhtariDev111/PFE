"""
animation_engine.py — Dynamic Manim animation generator for Aria
=================================================================
Improvements:
  - Better LLM prompt with explicit style guide and coordinate math
  - Syntax validation before rendering (catches errors early)
  - Hand-crafted scene library for 10 common topics (always reliable)
  - 3-attempt retry: LLM -> repair -> fallback scene
"""

import asyncio
import ast
import logging
import os
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("debate.animation")

VIDEOS_DIR = Path(__file__).resolve().parent.parent.parent / "outputs" / "animations"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG_PATH = r"C:\Users\mokht\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe"

# ─────────────────────────────────────────────────────────────────────────────
# HAND-CRAFTED SCENE LIBRARY
# ─────────────────────────────────────────────────────────────────────────────

# Maps topic keywords to verified, hand-crafted Manim code
# These always render correctly and look polished

_NEURAL_NETWORK_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Neural Network", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        layer_sizes = [3, 4, 4, 2]
        layer_x = [-4.5, -1.5, 1.5, 4.5]
        colors = [BLUE, GREEN, GREEN, RED]
        layer_labels = ["Input", "Hidden 1", "Hidden 2", "Output"]

        all_nodes = []
        for li, (n, x, col) in enumerate(zip(layer_sizes, layer_x, colors)):
            nodes = []
            for ni in range(n):
                y = (n - 1) / 2.0 - ni
                c = Circle(radius=0.28, color=col, fill_opacity=0.15, stroke_width=2)
                c.move_to([x, y, 0])
                nodes.append(c)
            all_nodes.append(nodes)
            group = VGroup(*nodes)
            self.play(LaggedStart(*[GrowFromCenter(nd) for nd in nodes], lag_ratio=0.15), run_time=0.8)
            lbl = Text(layer_labels[li], font_size=18, color=col)
            lbl.next_to(group, DOWN, buff=0.35)
            self.play(FadeIn(lbl), run_time=0.3)

        self.wait(0.3)

        connections = VGroup()
        for li in range(len(all_nodes) - 1):
            for a in all_nodes[li]:
                for b in all_nodes[li + 1]:
                    ln = Line(a.get_center(), b.get_center(),
                              stroke_width=0.8, stroke_opacity=0.4, color=GRAY)
                    connections.add(ln)
        self.play(Create(connections), run_time=1.5)
        self.wait(0.5)

        # Signal flow — highlight one path through the network
        for li in range(len(all_nodes)):
            node = all_nodes[li][0]
            self.play(node.animate.set_fill(YELLOW, opacity=0.8), run_time=0.4)
            self.wait(0.2)
            self.play(node.animate.set_fill(colors[li], opacity=0.15), run_time=0.3)

        self.wait(0.5)

        summary = Text("Data flows left to right through layers of neurons", font_size=20, color=WHITE)
        summary.to_edge(DOWN)
        self.play(Write(summary), run_time=1)
        self.wait(3)
'''

_GRADIENT_DESCENT_SCENE = '''
from manim import *
import numpy as np

class AnimationScene(Scene):
    def construct(self):
        title = Text("Gradient Descent", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        axes = Axes(
            x_range=[-3, 5, 1], y_range=[0, 20, 5],
            x_length=9, y_length=5,
            axis_config={"color": GRAY},
        ).shift(DOWN * 0.3)
        x_lbl = Text("Parameter θ", font_size=20).next_to(axes, DOWN, buff=0.2)
        y_lbl = Text("Loss J(θ)", font_size=20).next_to(axes, LEFT, buff=0.2)
        self.play(Create(axes), Write(x_lbl), Write(y_lbl), run_time=1)

        curve = axes.plot(lambda x: (x - 1)**2 + 1, color=BLUE, stroke_width=3)
        self.play(Create(curve), run_time=1)

        min_label = Text("Global Minimum", font_size=18, color=GREEN)
        min_label.next_to(axes.c2p(1, 1), UP, buff=0.15)
        min_dot = Dot(axes.c2p(1, 1), color=GREEN, radius=0.1)
        self.play(FadeIn(min_dot), Write(min_label))
        self.wait(0.3)

        x_vals = [4.0, 3.2, 2.5, 1.9, 1.4, 1.1, 1.0]
        dot = Dot(axes.c2p(x_vals[0], (x_vals[0]-1)**2+1), color=YELLOW, radius=0.12)
        self.play(GrowFromCenter(dot))

        step_lbl = Text("Step size = learning rate α", font_size=18, color=YELLOW)
        step_lbl.to_edge(DOWN)
        self.play(Write(step_lbl))

        for i in range(1, len(x_vals)):
            x_new = x_vals[i]
            y_new = (x_new - 1)**2 + 1
            grad_arrow = Arrow(
                axes.c2p(x_vals[i-1], (x_vals[i-1]-1)**2+1),
                axes.c2p(x_new, y_new),
                buff=0, color=ORANGE, stroke_width=2.5
            )
            self.play(GrowArrow(grad_arrow), run_time=0.4)
            self.play(dot.animate.move_to(axes.c2p(x_new, y_new)), run_time=0.5)
            self.remove(grad_arrow)

        self.wait(0.5)
        done = Text("Converged to minimum!", font_size=22, color=GREEN)
        done.to_edge(DOWN)
        self.play(Transform(step_lbl, done))
        self.wait(3)
'''

_OVERFITTING_SCENE = '''
from manim import *
import numpy as np

class AnimationScene(Scene):
    def construct(self):
        title = Text("Overfitting vs Good Fit", font_size=40, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        axes = Axes(
            x_range=[0, 10, 2], y_range=[0, 10, 2],
            x_length=9, y_length=5,
            axis_config={"color": GRAY},
        ).shift(DOWN * 0.3)
        x_lbl = Text("Feature X", font_size=20).next_to(axes, DOWN, buff=0.2)
        y_lbl = Text("Target Y", font_size=20).next_to(axes, LEFT, buff=0.2)
        self.play(Create(axes), Write(x_lbl), Write(y_lbl))

        data = [(1,2.1),(2,3.8),(3,3.2),(4,5.1),(5,4.8),(6,6.2),(7,5.9),(8,7.3),(9,6.8)]
        dots = VGroup(*[Dot(axes.c2p(x, y), color=WHITE, radius=0.08) for x, y in data])
        self.play(LaggedStart(*[GrowFromCenter(d) for d in dots], lag_ratio=0.1))
        self.wait(0.3)

        good = axes.plot(lambda x: 0.7*x + 1.2, x_range=[0.5, 9.5], color=GREEN, stroke_width=3)
        good_lbl = Text("Good Fit", font_size=22, color=GREEN).move_to(axes.c2p(7.5, 8.5))
        self.play(Create(good), Write(good_lbl))
        self.wait(1)

        coeffs = np.polyfit([x for x,y in data], [y for x,y in data], 8)
        poly = np.poly1d(coeffs)
        overfit = axes.plot(lambda x: float(np.clip(poly(x), 0, 10)),
                            x_range=[0.8, 9.2], color=RED, stroke_width=3)
        overfit_lbl = Text("Overfit", font_size=22, color=RED).move_to(axes.c2p(2, 8.5))
        self.play(Create(overfit), Write(overfit_lbl))
        self.wait(0.5)

        note = Text("Overfit memorizes noise — fails on new data", font_size=20, color=YELLOW)
        note.to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_SINE_COSINE_SCENE = '''
from manim import *
import numpy as np

class AnimationScene(Scene):
    def construct(self):
        title = Text("Sine and Cosine Waves", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        axes = Axes(
            x_range=[0, 2*np.pi, np.pi/2], y_range=[-1.5, 1.5, 0.5],
            x_length=10, y_length=4,
            axis_config={"color": GRAY},
        ).shift(DOWN * 0.3)
        x_lbl = Text("Angle (radians)", font_size=20).next_to(axes, DOWN, buff=0.2)
        y_lbl = Text("Value", font_size=20).next_to(axes, LEFT, buff=0.2)
        self.play(Create(axes), Write(x_lbl), Write(y_lbl))

        sine = axes.plot(np.sin, x_range=[0, 2*np.pi], color=BLUE, stroke_width=3)
        sine_lbl = Text("sin(x)", font_size=24, color=BLUE).move_to(axes.c2p(1.5, 1.2))
        self.play(Create(sine), Write(sine_lbl), run_time=1.5)
        self.wait(0.3)

        cosine = axes.plot(np.cos, x_range=[0, 2*np.pi], color=RED, stroke_width=3)
        cos_lbl = Text("cos(x)", font_size=24, color=RED).move_to(axes.c2p(3.5, 1.2))
        self.play(Create(cosine), Write(cos_lbl), run_time=1.5)
        self.wait(0.5)

        pi_lbl = Text("π", font_size=22, color=YELLOW).next_to(axes.c2p(np.pi, 0), DOWN, buff=0.15)
        two_pi_lbl = Text("2π", font_size=22, color=YELLOW).next_to(axes.c2p(2*np.pi, 0), DOWN, buff=0.15)
        self.play(Write(pi_lbl), Write(two_pi_lbl))

        note = Text("sin and cos are 90° (π/2) apart — same shape, shifted", font_size=20, color=WHITE)
        note.to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_PYTHAGOREAN_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Pythagorean Theorem", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        A = [-3, -1.5, 0]
        B = [0, -1.5, 0]
        C = [0, 1.5, 0]

        triangle = Polygon(A, B, C, color=WHITE, stroke_width=2.5)
        self.play(Create(triangle))

        right = Square(side_length=0.25, color=WHITE, stroke_width=1.5)
        right.move_to([B[0]-0.125, B[1]+0.125, 0])
        self.play(Create(right))

        a_lbl = Text("a", font_size=28, color=BLUE).move_to([-1.5, -1.9, 0])
        b_lbl = Text("b", font_size=28, color=GREEN).move_to([0.4, 0, 0])
        c_lbl = Text("c", font_size=28, color=RED).move_to([-1.8, 0.2, 0])
        self.play(Write(a_lbl), Write(b_lbl), Write(c_lbl))
        self.wait(0.5)

        sq_a = Square(side_length=3, color=BLUE, fill_opacity=0.2, stroke_width=2)
        sq_a.next_to(triangle, DOWN, buff=0, aligned_edge=LEFT)
        sq_a.shift(RIGHT * 0)

        sq_b = Square(side_length=3, color=GREEN, fill_opacity=0.2, stroke_width=2)
        sq_b.next_to(triangle, RIGHT, buff=0, aligned_edge=DOWN)

        self.play(FadeIn(sq_a), FadeIn(sq_b))
        self.wait(0.5)

        formula = Text("a² + b² = c²", font_size=40, color=YELLOW)
        formula.to_edge(DOWN).shift(UP * 0.3)
        self.play(Write(formula))

        note = Text("The square on the hypotenuse equals the sum of the other two squares",
                    font_size=18, color=WHITE)
        note.to_edge(DOWN)
        self.play(FadeIn(note))
        self.wait(3)
'''

_LINEAR_REGRESSION_SCENE = '''
from manim import *
import numpy as np

class AnimationScene(Scene):
    def construct(self):
        title = Text("Linear Regression", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        axes = Axes(
            x_range=[0, 10, 2], y_range=[0, 10, 2],
            x_length=9, y_length=5,
            axis_config={"color": GRAY},
        ).shift(DOWN * 0.3)
        self.play(Create(axes))

        np.random.seed(42)
        xs = np.linspace(1, 9, 12)
        ys = 0.8 * xs + 1.5 + np.random.normal(0, 0.6, 12)
        ys = np.clip(ys, 0.5, 9.5)

        dots = VGroup(*[Dot(axes.c2p(x, y), color=WHITE, radius=0.09) for x, y in zip(xs, ys)])
        self.play(LaggedStart(*[GrowFromCenter(d) for d in dots], lag_ratio=0.08))
        self.wait(0.3)

        m, b = np.polyfit(xs, ys, 1)
        line_start = axes.plot(lambda x: m*x + b, x_range=[0.5, 9.5], color=RED, stroke_width=3)
        line_lbl = Text(f"y = {m:.2f}x + {b:.2f}", font_size=22, color=RED)
        line_lbl.move_to(axes.c2p(7, 8.5))
        self.play(Create(line_start), Write(line_lbl), run_time=1.5)
        self.wait(0.5)

        residuals = VGroup()
        for x, y in zip(xs, ys):
            y_pred = m * x + b
            res = DashedLine(axes.c2p(x, y), axes.c2p(x, y_pred), color=YELLOW, stroke_width=1.5)
            residuals.add(res)
        self.play(Create(residuals), run_time=1)

        note = Text("Minimize residuals (errors) to find the best fit line", font_size=20, color=WHITE)
        note.to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_DECISION_TREE_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Decision Tree", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        def node(text, pos, color=BLUE):
            box = RoundedRectangle(width=2.8, height=0.7, corner_radius=0.1,
                                   color=color, fill_opacity=0.15, stroke_width=2)
            box.move_to(pos)
            lbl = Text(text, font_size=18, color=WHITE)
            lbl.move_to(pos)
            return VGroup(box, lbl)

        root = node("Age > 30?", [0, 2.5, 0], BLUE)
        left = node("Income > 50k?", [-3, 0.8, 0], GREEN)
        right = node("Has Degree?", [3, 0.8, 0], GREEN)
        ll = node("Approve", [-4.5, -1, 0], EMERALD)
        lr = node("Reject", [-1.5, -1, 0], RED)
        rl = node("Approve", [1.5, -1, 0], EMERALD)
        rr = node("Reject", [4.5, -1, 0], RED)

        self.play(FadeIn(root))
        self.wait(0.3)

        a1 = Arrow(root.get_bottom(), left.get_top(), buff=0.1, color=GRAY, stroke_width=2)
        a2 = Arrow(root.get_bottom(), right.get_top(), buff=0.1, color=GRAY, stroke_width=2)
        yes1 = Text("No", font_size=16, color=GRAY).next_to(a1, LEFT, buff=0.05)
        yes2 = Text("Yes", font_size=16, color=GRAY).next_to(a2, RIGHT, buff=0.05)
        self.play(GrowArrow(a1), GrowArrow(a2), Write(yes1), Write(yes2))
        self.play(FadeIn(left), FadeIn(right))
        self.wait(0.3)

        a3 = Arrow(left.get_bottom(), ll.get_top(), buff=0.1, color=GRAY, stroke_width=2)
        a4 = Arrow(left.get_bottom(), lr.get_top(), buff=0.1, color=GRAY, stroke_width=2)
        a5 = Arrow(right.get_bottom(), rl.get_top(), buff=0.1, color=GRAY, stroke_width=2)
        a6 = Arrow(right.get_bottom(), rr.get_top(), buff=0.1, color=GRAY, stroke_width=2)
        self.play(GrowArrow(a3), GrowArrow(a4), GrowArrow(a5), GrowArrow(a6))
        self.play(FadeIn(ll), FadeIn(lr), FadeIn(rl), FadeIn(rr))
        self.wait(0.5)

        note = Text("Each node splits data based on a condition", font_size=20, color=WHITE)
        note.to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_MATRIX_MULT_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Matrix Multiplication", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        def make_matrix(data, pos, color=WHITE):
            rows = len(data)
            cols = len(data[0])
            cells = VGroup()
            for i, row in enumerate(data):
                for j, val in enumerate(row):
                    cell = Square(side_length=0.7, color=color, stroke_width=1.5, fill_opacity=0.1)
                    cell.move_to([pos[0] + j*0.75, pos[1] - i*0.75, 0])
                    lbl = Text(str(val), font_size=22, color=WHITE)
                    lbl.move_to(cell.get_center())
                    cells.add(VGroup(cell, lbl))
            return cells

        A = [[1, 2], [3, 4]]
        B = [[5, 6], [7, 8]]
        C = [[1*5+2*7, 1*6+2*8], [3*5+4*7, 3*6+4*8]]

        mA = make_matrix(A, [-4.5, 0.4], BLUE)
        mB = make_matrix(B, [-1.2, 0.4], GREEN)
        mC = make_matrix(C, [2.5, 0.4], RED)

        lA = Text("A", font_size=28, color=BLUE).move_to([-4.5, 1.5, 0])
        lB = Text("B", font_size=28, color=GREEN).move_to([-1.2, 1.5, 0])
        eq = Text("=", font_size=36, color=WHITE).move_to([1.2, 0, 0])
        lC = Text("C = A x B", font_size=28, color=RED).move_to([2.5, 1.5, 0])

        self.play(FadeIn(mA), Write(lA))
        self.play(FadeIn(mB), Write(lB))
        self.play(Write(eq))
        self.wait(0.5)

        row_hl = SurroundingRectangle(VGroup(mA[0], mA[1]), color=YELLOW, buff=0.05)
        col_hl = SurroundingRectangle(VGroup(mB[0], mB[2]), color=YELLOW, buff=0.05)
        self.play(Create(row_hl), Create(col_hl))
        self.wait(0.5)
        self.play(FadeOut(row_hl), FadeOut(col_hl))

        self.play(FadeIn(mC), Write(lC))
        self.wait(0.5)

        note = Text("Row i of A  dot  Column j of B  =  C[i][j]", font_size=20, color=YELLOW)
        note.to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_BACKPROP_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Backpropagation", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        layer_sizes = [3, 4, 2]
        layer_x = [-4, 0, 4]
        colors = [BLUE, GREEN, RED]
        labels = ["Input", "Hidden", "Output"]

        all_nodes = []
        for li, (n, x, col) in enumerate(zip(layer_sizes, layer_x, colors)):
            nodes = []
            for ni in range(n):
                y = (n - 1) / 2 - ni
                c = Circle(radius=0.3, color=col, fill_opacity=0.15, stroke_width=2)
                c.move_to([x, y, 0])
                nodes.append(c)
            all_nodes.append(nodes)
            self.play(LaggedStart(*[GrowFromCenter(nd) for nd in nodes], lag_ratio=0.1), run_time=0.5)
            lbl = Text(labels[li], font_size=18, color=col)
            lbl.next_to(VGroup(*nodes), DOWN, buff=0.3)
            self.play(FadeIn(lbl), run_time=0.2)

        connections = []
        for li in range(len(all_nodes) - 1):
            for a in all_nodes[li]:
                for b in all_nodes[li + 1]:
                    ln = Line(a.get_center(), b.get_center(),
                              stroke_width=0.8, stroke_opacity=0.3, color=GRAY)
                    connections.append(ln)
        self.play(Create(VGroup(*connections)), run_time=1)
        self.wait(0.3)

        fwd_lbl = Text("Forward Pass", font_size=26, color=YELLOW).to_edge(DOWN)
        self.play(Write(fwd_lbl))
        for li in range(len(all_nodes)):
            self.play(*[nd.animate.set_fill(YELLOW, opacity=0.5) for nd in all_nodes[li]], run_time=0.4)
            self.play(*[nd.animate.set_fill(colors[li], opacity=0.15) for nd in all_nodes[li]], run_time=0.2)

        err = Text("Error = 0.72", font_size=22, color=RED)
        err.next_to(all_nodes[-1][-1], RIGHT, buff=0.3)
        self.play(Write(err))
        self.wait(0.3)

        bwd_lbl = Text("Backward Pass (Gradient)", font_size=26, color=ORANGE)
        bwd_lbl.to_edge(DOWN)
        self.play(Transform(fwd_lbl, bwd_lbl))
        for li in range(len(all_nodes) - 1, -1, -1):
            self.play(*[nd.animate.set_fill(ORANGE, opacity=0.5) for nd in all_nodes[li]], run_time=0.4)
            self.play(*[nd.animate.set_fill(colors[li], opacity=0.15) for nd in all_nodes[li]], run_time=0.2)

        note = Text("Gradients flow backward to update weights", font_size=20, color=WHITE)
        note.to_edge(DOWN)
        self.play(Transform(fwd_lbl, note))
        self.wait(3)
'''

_SORTING_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Bubble Sort Algorithm", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)

        values = [5, 3, 8, 1, 9, 2, 7, 4]
        n = len(values)
        bars = []
        bar_group = VGroup()

        for i, v in enumerate(values):
            bar = Rectangle(width=0.7, height=v * 0.4, color=BLUE,
                            fill_opacity=0.7, stroke_width=1.5)
            bar.move_to([-3.5 + i * 1.0, v * 0.2 - 1.5, 0])
            lbl = Text(str(v), font_size=20, color=WHITE)
            lbl.next_to(bar, DOWN, buff=0.1)
            bars.append(VGroup(bar, lbl))
            bar_group.add(bars[-1])

        self.play(LaggedStart(*[FadeIn(b) for b in bars], lag_ratio=0.1))
        self.wait(0.5)

        arr = list(values)
        for i in range(min(n - 1, 3)):
            for j in range(n - i - 1):
                self.play(bars[j][0].animate.set_color(YELLOW),
                          bars[j+1][0].animate.set_color(YELLOW), run_time=0.2)
                if arr[j] > arr[j+1]:
                    arr[j], arr[j+1] = arr[j+1], arr[j]
                    pos_j = bars[j].get_center()
                    pos_j1 = bars[j+1].get_center()
                    self.play(bars[j].animate.move_to(pos_j1),
                              bars[j+1].animate.move_to(pos_j), run_time=0.4)
                    bars[j], bars[j+1] = bars[j+1], bars[j]
                self.play(bars[j][0].animate.set_color(BLUE),
                          bars[j+1][0].animate.set_color(BLUE), run_time=0.15)

        note = Text("Bubble Sort: compare adjacent pairs, swap if out of order", font_size=18, color=WHITE)
        note.to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_KMEANS_SCENE = '''
from manim import *
import numpy as np

class AnimationScene(Scene):
    def construct(self):
        title = Text("K-Means Clustering", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        axes = Axes(x_range=[-1,10,2], y_range=[-1,10,2], x_length=9, y_length=5,
                    axis_config={"color": GRAY}).shift(DOWN*0.3)
        self.play(Create(axes))
        import numpy as np
        np.random.seed(7)
        cluster_data = [
            np.random.randn(8,2)*0.8 + [2,7],
            np.random.randn(8,2)*0.8 + [7,7],
            np.random.randn(8,2)*0.8 + [4.5,2],
        ]
        dot_colors = [BLUE, GREEN, RED]
        all_dots = []
        for pts, col in zip(cluster_data, dot_colors):
            for p in pts:
                d = Dot(axes.c2p(float(np.clip(p[0],-0.5,9.5)), float(np.clip(p[1],-0.5,9.5))), color=WHITE, radius=0.08)
                all_dots.append((d, col))
        self.play(LaggedStart(*[GrowFromCenter(d) for d,_ in all_dots], lag_ratio=0.05), run_time=1.5)
        self.wait(0.3)
        step1 = Text("Step 1: Place K=3 centroids randomly", font_size=20, color=YELLOW).to_edge(DOWN)
        self.play(Write(step1))
        centroids_pos = [[2.5,6.5],[6.5,7.5],[5,3]]
        centroids = [Dot(axes.c2p(cx,cy), color=YELLOW, radius=0.18) for cx,cy in centroids_pos]
        self.play(*[GrowFromCenter(c) for c in centroids], run_time=0.8)
        self.wait(0.5)
        step2 = Text("Step 2: Assign each point to nearest centroid", font_size=20, color=YELLOW).to_edge(DOWN)
        self.play(Transform(step1, step2))
        for d, col in all_dots:
            self.play(d.animate.set_color(col), run_time=0.04)
        self.wait(0.5)
        step3 = Text("Step 3: Move centroids to cluster mean", font_size=20, color=YELLOW).to_edge(DOWN)
        self.play(Transform(step1, step3))
        new_pos = [[float(np.mean(cluster_data[i][:,0])), float(np.mean(cluster_data[i][:,1]))] for i in range(3)]
        for c, (nx,ny) in zip(centroids, new_pos):
            self.play(c.animate.move_to(axes.c2p(nx,ny)), run_time=0.6)
        self.wait(0.5)
        done = Text("Repeat until centroids stop moving — clusters found!", font_size=20, color=GREEN).to_edge(DOWN)
        self.play(Transform(step1, done))
        self.wait(3)
'''

_CNN_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Convolutional Neural Network (CNN)", font_size=36, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        def layer_block(w, h, d, pos, color, label):
            rects = VGroup()
            for i in range(d):
                r = Rectangle(width=w, height=h, color=color, fill_opacity=0.2, stroke_width=1.5)
                r.move_to([pos[0]+i*0.1, pos[1]+i*0.1, 0])
                rects.add(r)
            lbl = Text(label, font_size=14, color=color)
            lbl.next_to(rects, DOWN, buff=0.2)
            return VGroup(rects, lbl)
        layers = [
            layer_block(0.8, 2.5, 1, [-5.5, 0], WHITE,  "Input"),
            layer_block(0.5, 2.2, 4, [-3.8, 0], BLUE,   "Conv1"),
            layer_block(0.5, 1.8, 4, [-2.0, 0], TEAL,   "Pool1"),
            layer_block(0.5, 1.5, 8, [-0.2, 0], GREEN,  "Conv2"),
            layer_block(0.5, 1.2, 8, [1.8,  0], TEAL,   "Pool2"),
            layer_block(0.3, 3.0, 1, [3.5,  0], ORANGE, "Flatten"),
            layer_block(0.3, 2.0, 1, [4.5,  0], RED,    "Output"),
        ]
        for l in layers:
            self.play(FadeIn(l), run_time=0.4)
        self.wait(0.5)
        xs = [-5.1, -3.3, -1.5, 0.3, 2.2, 3.8, 4.8]
        arrows = VGroup(*[Arrow([xs[i],0,0],[xs[i+1],0,0], buff=0.05, color=GRAY, stroke_width=1.5) for i in range(len(xs)-1)])
        self.play(Create(arrows), run_time=1)
        note = Text("Conv extracts features, Pool reduces size, FC classifies", font_size=18, color=WHITE)
        note.to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_SVM_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Support Vector Machine (SVM)", font_size=40, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        axes = Axes(x_range=[0,10,2], y_range=[0,10,2], x_length=9, y_length=5,
                    axis_config={"color": GRAY}).shift(DOWN*0.3)
        self.play(Create(axes))
        class1 = [(2,7),(1.5,5.5),(3,6),(2.5,8),(1,6.5),(3.5,7.5)]
        class2 = [(7,3),(6.5,2),(8,4),(7.5,1.5),(6,3.5),(8.5,2.5)]
        dots1 = VGroup(*[Dot(axes.c2p(x,y), color=BLUE, radius=0.1) for x,y in class1])
        dots2 = VGroup(*[Dot(axes.c2p(x,y), color=RED, radius=0.1) for x,y in class2])
        self.play(LaggedStart(*[GrowFromCenter(d) for d in dots1], lag_ratio=0.1), run_time=0.8)
        self.play(LaggedStart(*[GrowFromCenter(d) for d in dots2], lag_ratio=0.1), run_time=0.8)
        lbl1 = Text("Class A", font_size=20, color=BLUE).move_to(axes.c2p(2,9))
        lbl2 = Text("Class B", font_size=20, color=RED).move_to(axes.c2p(8,1))
        self.play(Write(lbl1), Write(lbl2))
        boundary = axes.plot(lambda x: -x+10, x_range=[1,9], color=GREEN, stroke_width=3)
        margin1  = axes.plot(lambda x: -x+11.5, x_range=[1.5,9], color=GREEN, stroke_width=1.5, stroke_opacity=0.5)
        margin2  = axes.plot(lambda x: -x+8.5,  x_range=[0.5,8.5], color=GREEN, stroke_width=1.5, stroke_opacity=0.5)
        self.play(Create(boundary), run_time=1)
        b_lbl = Text("Decision Boundary", font_size=18, color=GREEN).move_to(axes.c2p(8,3.5))
        self.play(Write(b_lbl))
        self.play(Create(margin1), Create(margin2), run_time=0.8)
        note = Text("SVM maximizes the margin between classes", font_size=20, color=WHITE).to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_BINARY_SEARCH_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Binary Search Algorithm", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        arr = [2,5,8,12,16,23,38,45,56,72]
        target = 23
        n = len(arr)
        boxes = VGroup()
        for i, v in enumerate(arr):
            box = Square(side_length=0.75, color=WHITE, fill_opacity=0.1, stroke_width=1.5)
            box.move_to([-4.5+i*1.0, 0.5, 0])
            lbl = Text(str(v), font_size=22, color=WHITE)
            lbl.move_to(box.get_center())
            boxes.add(VGroup(box, lbl))
        self.play(LaggedStart(*[FadeIn(b) for b in boxes], lag_ratio=0.08), run_time=1)
        target_lbl = Text(f"Search for: {target}", font_size=26, color=YELLOW).move_to([0,-0.8,0])
        self.play(Write(target_lbl))
        self.wait(0.3)
        lo, hi = 0, n-1
        steps = []
        tlo, thi = lo, hi
        while tlo <= thi:
            mid = (tlo+thi)//2
            steps.append((tlo, thi, mid))
            if arr[mid] == target: break
            elif arr[mid] < target: tlo = mid+1
            else: thi = mid-1
        for slo, shi, mid in steps:
            rng = SurroundingRectangle(VGroup(*[boxes[i] for i in range(slo, shi+1)]), color=BLUE, buff=0.05)
            mid_r = SurroundingRectangle(boxes[mid], color=YELLOW, buff=0.05)
            txt = Text(f"mid={mid}  arr[mid]={arr[mid]}", font_size=20, color=WHITE).move_to([0,-1.5,0])
            self.play(Create(rng), Create(mid_r), Write(txt), run_time=0.6)
            self.wait(0.6)
            self.play(FadeOut(rng), FadeOut(mid_r), FadeOut(txt), run_time=0.3)
        found = SurroundingRectangle(boxes[mid], color=GREEN, buff=0.05, stroke_width=3)
        found_txt = Text(f"Found {target} at index {mid}!", font_size=24, color=GREEN).to_edge(DOWN)
        self.play(Create(found), Write(found_txt))
        self.wait(3)
'''

_FOURIER_SCENE = '''
from manim import *
import numpy as np

class AnimationScene(Scene):
    def construct(self):
        title = Text("Fourier Series", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        axes = Axes(x_range=[0,2*np.pi,np.pi/2], y_range=[-1.8,1.8,0.5],
                    x_length=10, y_length=4, axis_config={"color": GRAY}).shift(DOWN*0.3)
        self.play(Create(axes))
        def sq(x, n):
            s = 0
            for k in range(1, n*2, 2):
                s += (4/(np.pi*k))*np.sin(k*x)
            return s
        colors = [BLUE, GREEN, YELLOW, ORANGE, RED]
        labels = ["1 term","3 terms","5 terms","7 terms","9 terms"]
        for n, col, lbl in zip([1,2,3,4,5], colors, labels):
            c = axes.plot(lambda x,n=n: sq(x,n), x_range=[0.01,2*np.pi-0.01], color=col, stroke_width=2)
            cl = Text(lbl, font_size=18, color=col).to_edge(DOWN).shift(UP*0.3)
            self.play(Create(c), Write(cl), run_time=0.8)
            self.wait(0.4)
            self.play(FadeOut(cl), run_time=0.2)
        note = Text("More sine waves = better approximation of square wave", font_size=20, color=WHITE).to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_BAYES_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Bayes Theorem", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        formula = Text("P(A|B) = P(B|A) x P(A) / P(B)", font_size=34, color=YELLOW)
        formula.move_to([0,1.5,0])
        self.play(Write(formula), run_time=1.5)
        self.wait(0.5)
        terms = [
            ("P(A|B)", "Posterior: probability of A given B", BLUE),
            ("P(B|A)", "Likelihood: probability of B given A", GREEN),
            ("P(A)",   "Prior: initial probability of A", ORANGE),
            ("P(B)",   "Evidence: total probability of B", RED),
        ]
        for i, (term, desc, col) in enumerate(terms):
            t = Text(f"{term}  =  {desc}", font_size=20, color=col)
            t.move_to([0, 0.3-i*0.7, 0])
            self.play(FadeIn(t), run_time=0.5)
            self.wait(0.2)
        note = Text("Bayes updates our belief when new evidence arrives", font_size=18, color=WHITE).to_edge(DOWN)
        self.play(FadeIn(note))
        self.wait(3)
'''

_ACTIVATION_SCENE = '''
from manim import *
import numpy as np

class AnimationScene(Scene):
    def construct(self):
        title = Text("Activation Functions", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        axes = Axes(x_range=[-4,4,1], y_range=[-0.2,1.2,0.2],
                    x_length=10, y_length=4, axis_config={"color": GRAY}).shift(DOWN*0.3)
        x_lbl = Text("Input z", font_size=20).next_to(axes, DOWN, buff=0.2)
        y_lbl = Text("Output", font_size=20).next_to(axes, LEFT, buff=0.2)
        self.play(Create(axes), Write(x_lbl), Write(y_lbl))
        relu_c = axes.plot(lambda x: max(0,x), x_range=[-4,4], color=BLUE, stroke_width=3)
        sig_c  = axes.plot(lambda x: 1/(1+np.exp(-x)), x_range=[-4,4], color=GREEN, stroke_width=3)
        tanh_c = axes.plot(lambda x: (np.tanh(x)+1)/2, x_range=[-4,4], color=RED, stroke_width=3)
        relu_l = Text("ReLU: max(0,z)", font_size=20, color=BLUE).move_to([-2.5,1.0,0])
        sig_l  = Text("Sigmoid", font_size=20, color=GREEN).move_to([1.5,0.9,0])
        tanh_l = Text("Tanh (norm)", font_size=20, color=RED).move_to([2.5,0.5,0])
        self.play(Create(relu_c), Write(relu_l), run_time=1)
        self.wait(0.3)
        self.play(Create(sig_c), Write(sig_l), run_time=1)
        self.wait(0.3)
        self.play(Create(tanh_c), Write(tanh_l), run_time=1)
        note = Text("Activation functions add non-linearity to neural networks", font_size=20, color=WHITE).to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

_CONFUSION_MATRIX_SCENE = '''
from manim import *

class AnimationScene(Scene):
    def construct(self):
        title = Text("Confusion Matrix", font_size=44, color=WHITE)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP).set_color(BLUE))
        self.wait(0.5)
        data = [("TP=50","FP=10",GREEN,ORANGE),("FN=5","TN=35",RED,GREEN)]
        cells = VGroup()
        for i in range(2):
            for j in range(2):
                box = Square(side_length=1.8, stroke_width=2, color=data[i][2+j], fill_opacity=0.15)
                box.move_to([-1.5+j*2.0, 0.5-i*2.0, 0])
                lbl = Text(data[i][j], font_size=26, color=WHITE)
                lbl.move_to(box.get_center())
                cells.add(VGroup(box, lbl))
        row_lbls = ["Pred Positive","Pred Negative"]
        col_lbls = ["Actual Positive","Actual Negative"]
        for i, lbl in enumerate(row_lbls):
            cells.add(Text(lbl, font_size=16, color=GRAY).move_to([-1.5+i*2.0, 1.8, 0]))
        for i, lbl in enumerate(col_lbls):
            cells.add(Text(lbl, font_size=16, color=GRAY).move_to([-3.8, 0.5-i*2.0, 0]))
        self.play(FadeIn(cells), run_time=1.5)
        self.wait(0.5)
        prec = Text("Precision = TP/(TP+FP) = 50/60 = 0.83", font_size=18, color=GREEN).move_to([2.8,0.5,0])
        rec  = Text("Recall = TP/(TP+FN) = 50/55 = 0.91", font_size=18, color=BLUE).move_to([2.8,-0.3,0])
        self.play(Write(prec), run_time=0.8)
        self.play(Write(rec), run_time=0.8)
        note = Text("Confusion matrix shows correct vs incorrect predictions", font_size=18, color=WHITE).to_edge(DOWN)
        self.play(Write(note))
        self.wait(3)
'''

# Registry: maps keyword patterns to hand-crafted scenes
SCENE_LIBRARY = [
    (["neural network", "neural net", "perceptron", "deep learning layers"], _NEURAL_NETWORK_SCENE, "Neural network with input, hidden, and output layers showing forward signal propagation"),
    (["gradient descent", "gradient", "optimization", "learning rate"], _GRADIENT_DESCENT_SCENE, "Gradient descent optimization showing a loss curve and a point converging to the minimum"),
    (["overfitting", "overfit", "underfitting", "bias variance"], _OVERFITTING_SCENE, "Overfitting vs good fit on scatter data showing how complex models memorize noise"),
    (["sine", "cosine", "trigonometric", "sin cos", "wave"], _SINE_COSINE_SCENE, "Sine and cosine waves plotted on the same axes showing their phase relationship"),
    (["pythagorean", "pythagoras", "right triangle", "hypotenuse"], _PYTHAGOREAN_SCENE, "Pythagorean theorem with a right triangle and squares on each side"),
    (["linear regression", "regression line", "least squares", "best fit line"], _LINEAR_REGRESSION_SCENE, "Linear regression fitting a line to scatter data with residuals shown"),
    (["decision tree", "tree classifier", "tree split", "random forest"], _DECISION_TREE_SCENE, "Decision tree with root, branches, and leaf nodes showing classification splits"),
    (["matrix multiplication", "matrix product", "dot product matrix"], _MATRIX_MULT_SCENE, "Matrix multiplication showing how rows and columns combine to produce the result"),
    (["backpropagation", "backprop", "backward pass", "gradient flow"], _BACKPROP_SCENE, "Backpropagation showing forward pass then backward gradient flow through a neural network"),
    (["bubble sort", "sorting algorithm", "sort array", "insertion sort"], _SORTING_SCENE, "Bubble sort algorithm animating comparisons and swaps on an array of bars"),
    (["k-means", "kmeans", "clustering", "cluster"], _KMEANS_SCENE, "K-means clustering showing data points being assigned to 3 clusters with centroid updates"),
    (["convolutional", "cnn", "convolution", "feature map", "pooling"], _CNN_SCENE, "Convolutional neural network showing input, conv, pooling, and fully connected layers"),
    (["support vector", "svm", "hyperplane", "margin"], _SVM_SCENE, "Support Vector Machine showing data points, decision boundary, and maximum margin hyperplane"),
    (["binary search", "binary tree", "search algorithm"], _BINARY_SEARCH_SCENE, "Binary search algorithm showing how the search space halves at each step"),
    (["fourier", "frequency", "signal decomposition", "spectrum"], _FOURIER_SCENE, "Fourier series showing how sine waves combine to approximate a square wave"),
    (["probability", "bayes", "conditional probability", "bayesian"], _BAYES_SCENE, "Bayes theorem with a visual example of conditional probability"),
    (["relu", "activation function", "sigmoid", "tanh"], _ACTIVATION_SCENE, "Neural network activation functions: ReLU, Sigmoid, and Tanh plotted together"),
    (["confusion matrix", "precision recall", "f1 score", "classification metrics"], _CONFUSION_MATRIX_SCENE, "Confusion matrix showing TP, FP, FN, TN with precision and recall formulas"),
]


def _find_prebuilt_scene(topic: str):
    """Return (code, description) if topic matches a hand-crafted scene, else (None, None)."""
    t = topic.lower().strip()
    for keywords, code, desc in SCENE_LIBRARY:
        if any(kw in t for kw in keywords):
            return code, desc
    return None, None


# ─────────────────────────────────────────────────────────────────────────────
# LLM PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

_CODEGEN_PROMPT = """\
You are an expert Manim animation developer. Generate a PRECISE, ACCURATE educational animation.

Topic: "{topic}"

STYLE GUIDE (apply to every animation):
- Background: default black — use light/bright colors for all elements
- Title: Text("...", font_size=44, color=WHITE), then .to_edge(UP).set_color(BLUE)
- Axes: always include x_label and y_label as Text() objects
- Colors: BLUE for primary, GREEN for positive/correct, RED for negative/wrong, YELLOW for highlights, ORANGE for gradients/flow
- Font sizes: title=44, section labels=28, axis labels=20, annotations=18
- Spacing: buff=0.3 minimum between any two elements
- End every animation with a summary Text().to_edge(DOWN)
- run_time=1.0 for important animations, 0.4 for minor ones

MANDATORY RULES:
1. Class name MUST be exactly: AnimationScene
2. Import ONLY: from manim import *
3. NEVER use MathTex, Tex, LaTeX — use Text() ONLY
4. Use Unicode for math: alpha beta theta nabla Sigma squared cubed sqrt approx
5. Scene: 20-30 seconds total
6. NEVER pass a raw Mobject to self.play() — always wrap: Create(), FadeIn(), Write(), GrowFromCenter(), GrowArrow()
7. NEVER use hardcoded list indices — use enumerate() or range(len())
8. All coordinates: x in [-6,6], y in [-3.5,3.5]
9. After title.to_edge(UP), shift all content DOWN by 0.3 to avoid overlap

COORDINATE MATH FOR NEURAL NETWORKS:
  layer_sizes = [3, 4, 2]
  layer_x = [-4, 0, 4]
  For layer i with n nodes:
    y_positions = [(n-1)/2 - j for j in range(n)]
  Connections: Line(node_a.get_center(), node_b.get_center(), stroke_width=0.8)
  NEVER index nodes with hardcoded numbers

COORDINATE MATH FOR GRAPHS:
  axes = Axes(x_range=[xmin, xmax, step], y_range=[ymin, ymax, step], x_length=9, y_length=5)
  axes.shift(DOWN * 0.3)
  Use axes.c2p(x, y) to convert data coordinates to screen coordinates
  Use axes.plot(lambda x: ...) for curves

Return ONLY this JSON (no markdown):
{{
  "code": "<complete Python code, use \\\\n for newlines>",
  "description": "<one accurate sentence>"
}}"""

_REPAIR_PROMPT = (
    "The Manim code failed with this error:\\n{error}\\n\\n"
    "Failed code:\\n{code}\\n\\n"
    "Fix it. Key rules:\\n"
    "1. self.play() only accepts Animation objects — wrap everything: Create(obj), FadeIn(obj), Write(obj)\\n"
    "2. IndexError: use enumerate() not hardcoded indices\\n"
    "3. Class name: AnimationScene\\n"
    "4. No MathTex/LaTeX — Text() only\\n"
    "5. No imports beyond: from manim import *\\n"
    'Return ONLY JSON: {{"code": "<fixed>", "description": "<desc>"}}'
)

_FALLBACK_PROMPT = """\
Generate a simple but accurate Manim animation for: "{topic}"

Use ONLY: Text(), FadeIn, Write, Create, Dot, Line, Arrow, Axes
NO complex indexing. Position with .move_to([x, y, 0]).

Structure:
1. Title at top
2. 3-4 key facts as Text objects, appearing one by one, stacked vertically
3. One simple visual (axes with a curve, OR a few shapes with labels)
4. Summary at bottom

Return ONLY JSON: {{"code": "<code>", "description": "<desc>"}}"""


# ─────────────────────────────────────────────────────────────────────────────
# SYNTAX VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

def _validate_syntax(code: str) -> str | None:
    """Return error message if code has a syntax error, else None."""
    try:
        ast.parse(code)
        return None
    except SyntaxError as e:
        return f"SyntaxError at line {e.lineno}: {e.msg}"


# ─────────────────────────────────────────────────────────────────────────────
# ANIMATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

class AnimationEngine:
    def __init__(self, llm_engine: LLMEngine = None):
        self.llm = llm_engine or LLMEngine()

    async def generate(self, topic: str) -> dict:
        """Generate and render a Manim animation. Returns {video_path, description, prebuilt} or {error}."""

        # ── Check hand-crafted library first ─────────────────────────────────
        prebuilt_code, prebuilt_desc = _find_prebuilt_scene(topic)
        if prebuilt_code:
            print(f"📚 [Animation] Using pre-built scene for: '{topic}'", flush=True)
            video_path, error = await asyncio.to_thread(_render, prebuilt_code, topic)
            if video_path:
                return {"video_path": str(video_path), "description": prebuilt_desc, "prebuilt": True}
            print(f"⚠️  [Animation] Pre-built scene failed: {error[:100]} — falling back to LLM", flush=True)

        # ── LLM generation ────────────────────────────────────────────────────
        print(f"\n🎬 [Animation] Generating code for: '{topic}'", flush=True)
        prompt = _CODEGEN_PROMPT.format(topic=topic) + f"\n\n# seed: {uuid.uuid4().hex[:8]}"
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        code, description = _extract_code_and_desc(raw)

        if not code:
            log.error(f"LLM returned no code for: {topic}")
            return {"error": "Failed to generate animation code"}

        # Syntax check before rendering
        syn_err = _validate_syntax(code)
        if syn_err:
            print(f"⚠️  [Animation] Syntax error in generated code: {syn_err}", flush=True)
            repair = _REPAIR_PROMPT.format(error=syn_err, code=code[:2000])
            raw2 = await self.llm.generate_async("", [], prompt_override=repair)
            code2, desc2 = _extract_code_and_desc(raw2)
            if code2 and not _validate_syntax(code2):
                code, description = code2, desc2 or description
            else:
                code = None

        if not code:
            return {"error": "Could not generate valid animation code"}

        print(f"✅ [Animation] Code ready ({len(code)} chars). Rendering…", flush=True)
        video_path, error = await asyncio.to_thread(_render, code, topic)

        # Retry with repair
        if not video_path:
            print(f"⚠️  [Animation] Render failed — retrying with repair", flush=True)
            repair = _REPAIR_PROMPT.format(error=(error or "")[:500], code=code[:3000])
            raw2 = await self.llm.generate_async("", [], prompt_override=repair)
            code2, desc2 = _extract_code_and_desc(raw2)
            if code2:
                if desc2: description = desc2
                video_path, error = await asyncio.to_thread(_render, code2, topic)

        # Final fallback: simple scene
        if not video_path:
            print(f"🔁 [Animation] Trying simple fallback", flush=True)
            raw3 = await self.llm.generate_async("", [], prompt_override=_FALLBACK_PROMPT.format(topic=topic))
            code3, desc3 = _extract_code_and_desc(raw3)
            if code3:
                if desc3: description = desc3
                video_path, _ = await asyncio.to_thread(_render, code3, topic)

        if not video_path:
            return {"error": f"Render failed after all attempts: {(error or '')[:200]}"}

        print(f"🎉 [Animation] Done: {video_path}", flush=True)
        return {"video_path": str(video_path), "description": description, "prebuilt": False}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_code_and_desc(raw: str) -> tuple[str, str]:
    import json as _json
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        data = _json.loads(text)
        return data.get("code", "").strip(), data.get("description", "")
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            data = _json.loads(match.group(0))
            return data.get("code", "").strip(), data.get("description", "")
        except Exception:
            # Try fixing unescaped newlines inside the "code" string value
            try:
                fixed = re.sub(
                    r'("code"\s*:\s*")([\s\S]*?)("(?:\s*,|\s*\}))',
                    lambda m: m.group(1) + m.group(2).replace("\n", "\\n").replace("\r", "") + m.group(3),
                    match.group(0),
                )
                data = _json.loads(fixed)
                return data.get("code", "").strip(), data.get("description", "")
            except Exception:
                pass
    code_match = re.search(r"```python\s*([\s\S]+?)```", raw)
    if code_match:
        return code_match.group(1).strip(), ""
    return "", ""


def _render(code: str, topic: str) -> tuple[str | None, str | None]:
    env = os.environ.copy()
    ffmpeg_dir = str(Path(FFMPEG_PATH).parent)
    env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")

    safe_topic = re.sub(r"[^\w]", "_", topic.lower())[:30]
    output_name = f"{safe_topic}_{uuid.uuid4().hex[:6]}.mp4"
    output_path = VIDEOS_DIR / output_name

    with tempfile.TemporaryDirectory(prefix="manim_") as tmp:
        scene_file = Path(tmp) / "scene.py"
        scene_file.write_text(code, encoding="utf-8")

        cmd = [
            sys.executable, "-m", "manim", "render",
            "--media_dir", tmp,
            "-qh",
            "--format", "mp4",
            str(scene_file), "AnimationScene",
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180, env=env, cwd=tmp)
        except subprocess.TimeoutExpired:
            return None, "Render timed out (180s)"
        except Exception as e:
            return None, str(e)

        if result.returncode != 0:
            return None, (result.stderr or result.stdout or "")[-600:]

        import shutil
        mp4_files = [p for p in Path(tmp).rglob("*.mp4") if "partial_movie_files" not in p.parts]
        if not mp4_files:
            return None, "No mp4 output found"

        best = max(mp4_files, key=lambda p: p.stat().st_size)

        # Remux with faststart so the browser can play without buffering the whole file
        faststart_cmd = [
            str(Path(FFMPEG_PATH)),
            "-y", "-i", str(best),
            "-c", "copy",
            "-movflags", "+faststart",
            str(output_path),
        ]
        try:
            fs = subprocess.run(faststart_cmd, capture_output=True, text=True, timeout=60, env=env)
            if fs.returncode != 0 or not output_path.exists():
                # faststart failed — just copy the raw file, still watchable
                shutil.copy2(str(best), str(output_path))
        except Exception:
            shutil.copy2(str(best), str(output_path))

        return output_path, None
