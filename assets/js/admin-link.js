(function () {
  if (sessionStorage.getItem('blog_admin') === 'verified') {
    document.getElementById('new-post-link').hidden = false;
  }
}());
