(function () {
  'use strict';
  const list = document.getElementById('blog-post-list');
  if (!list) return;
  const posts = Array.from(list.children);
  const select = document.getElementById('posts-per-page');
  const navigation = document.getElementById('blog-pagination');
  let currentPage = 1;

  function render() {
    const perPage = Number(select.value);
    const totalPages = Math.ceil(posts.length / perPage);
    currentPage = Math.min(currentPage, Math.max(totalPages, 1));
    posts.forEach((post, index) => {
      post.hidden = index < (currentPage - 1) * perPage || index >= currentPage * perPage;
    });
    navigation.replaceChildren();
    if (totalPages <= 1) return;
    for (let page = 1; page <= totalPages; page++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(page);
      button.setAttribute('aria-label', page + '페이지');
      if (page === currentPage) {
        button.setAttribute('aria-current', 'page');
        button.textContent = '[' + page + ']';
      }
      button.addEventListener('click', () => {
        currentPage = page;
        render();
        list.scrollIntoView({ block: 'start' });
      });
      navigation.append(button);
    }
  }

  select.addEventListener('change', () => { currentPage = 1; render(); });
  document.addEventListener('blog-post-deleted', event => {
    const item = posts.find(post => post.contains(event.detail.button));
    if (item) posts.splice(posts.indexOf(item), 1);
    render();
  });
  render();
}());
