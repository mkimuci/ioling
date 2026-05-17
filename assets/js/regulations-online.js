document.addEventListener("DOMContentLoaded", function() {
  // Section anchor links
  document.querySelectorAll("h2[id], h3[id], h4[id]").forEach(function(h) {
    var a = document.createElement("a");
    a.href = "#" + h.id;
    a.className = "header-anchor";
    a.title = "Link to this section";
    a.textContent = "#";
    h.appendChild(a);
  });

  // Footnote tooltips
  var box = document.createElement("div");
  box.className = "fn-tooltip-box";
  document.body.appendChild(box);

  function position(e) {
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + 360 > window.innerWidth)  x = e.clientX - 360;
    if (y + box.offsetHeight + 10 > window.innerHeight) y = e.clientY - box.offsetHeight - 10;
    box.style.left = x + "px";
    box.style.top  = y + "px";
  }

  document.querySelectorAll("sup.fn-ref").forEach(function(el) {
    el.addEventListener("mouseenter", function(e) {
      box.textContent = el.dataset.fn;
      box.style.display = "block";
      position(e);
    });
    el.addEventListener("mousemove", position);
    el.addEventListener("mouseleave", function() { box.style.display = "none"; });
  });
});
