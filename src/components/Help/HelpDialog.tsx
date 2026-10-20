// Instructions: how the parts of the app that aren't obvious at a glance work. Pick a topic on the left.
import { type ReactNode, useState } from "react";
import { Dialog } from "../ui/Dialog";

const K = ({ children }: { children: ReactNode }) => <kbd className="help-kbd">{children}</kbd>;

const TOPICS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "layout",
    title: "Panels & layout",
    body: (
      <>
        <p>The window is made of five panels: <b>Totals</b>, <b>Bills</b>, <b>Inspector</b>, <b>Viewer</b> and <b>Schedule</b>. You can rearrange them however you like, and the layout is remembered.</p>
        <ul>
          <li><b>Move a panel:</b> drag the <span className="mono">⠿</span> grip at the left of its header (or its tab). While dragging, a dotted outline shows where it will land:
            <ul>
              <li>Drop in the <b>middle</b> of another panel to add it there as a tab.</li>
              <li>Drop near a panel's <b>edge</b> to split that panel in half.</li>
              <li>Drop right at the <b>border of the window</b> to dock it along that whole side.</li>
            </ul>
          </li>
          <li><b>Resize:</b> drag the thin lines between panels.</li>
          <li><b>Maximise:</b> double-click a panel's header, or click <span className="mono">⤢</span>. Press <K>Esc</K> or <span className="mono">⤡</span> to go back.</li>
          <li><b>Reset layout</b> (top bar) puts everything back where it started.</li>
        </ul>
      </>
    ),
  },
  {
    id: "bills",
    title: "Bills & categories",
    body: (
      <>
        <p>Each row shows the bill's title, the visit date, member and claim number, its status, and on the right the amount in <b>Your Responsibility</b>.</p>
        <ul>
          <li><b>Categories</b> are folders for bills (e.g. one per family member or per year). Click a category header to collapse it. The amount on the right of a category header is the total of Your Responsibility for the bills in it.</li>
          <li><b>Rename</b> a category by double-clicking its name or with <span className="mono">✎</span>. Deleting a category moves its bills to Uncategorized; it doesn't delete them.</li>
          <li><b>Reorder:</b> drag a bill to move it within or between categories; drag a category's <span className="mono">⠿</span> to reorder categories. Dragging is switched off while you're searching or a filter is on.</li>
          <li><b>Search</b> looks through every field on every bill. <K>Esc</K> clears it.</li>
          <li>You can also move a bill with the category menu at the top of the Inspector.</li>
        </ul>
      </>
    ),
  },
  {
    id: "inspector",
    title: "Inspector & fields",
    body: (
      <>
        <p>The Inspector is where you edit the selected bill. Changes save automatically.</p>
        <ul>
          <li><b>Sections</b> (Visit, Claim, Amounts, Tracking, Scans, Custom fields) collapse when you click their header and can be reordered by dragging their <span className="mono">⠿</span>. The order you choose here is also the order things appear in the Viewer.</li>
          <li><b>Field buttons</b> appear when you hover a field: <span className="mono">↑ ↓</span> move it, <span className="mono">✎</span> renames it (your own fields only; you can also double-click the name), <span className="mono">✕</span> deletes the field from <i>every</i> bill. If a total, filter or control used it, you're told which ones, and they're flagged with <span className="mono">⚠</span> until you fix them.</li>
          <li>Deleted a built-in field by mistake? <b>Restore deleted default fields</b> appears at the bottom of Custom fields.</li>
          <li><b>Money</b> fields take plain amounts like <span className="mono">125.50</span>; the $ and commas are added for you.</li>
          <li><b>Status:</b> pick <i>Edit list…</i> in the status menu to add, rename, reorder or recolour statuses.</li>
          <li><b>The calendar icon</b> next to a date puts that date on the Schedule. It's per bill and per date field.</li>
        </ul>
        <h4 className="label">Custom & combined fields</h4>
        <p>Under <b>Custom fields</b> you can add your own Text, Money, Number or Date fields. They appear on every bill and can be used in totals, filters and controls.</p>
        <p>A <b>Combined</b> field groups several parts under one name, for example <i>Due</i> made of an <i>Amount</i> and a <i>Date</i>. Each part works like its own field elsewhere in the app and shows up as “Due · Amount” and “Due · Date”.</p>
        <h4 className="label">Scans</h4>
        <p>Drop a PDF, PNG or JPEG anywhere on the window to attach it to the selected bill, or use <b>Choose file…</b>. The app keeps its own copy, so you can delete the original. Click a thumbnail to view it full size.</p>
      </>
    ),
  },
  {
    id: "viewer",
    title: "Viewer",
    body: (
      <>
        <p>The Viewer is a read-only summary of the selected bill with its scan beside it.</p>
        <ul>
          <li>The scan sits above the summary if <b>Scans</b> is in the top half of the Inspector's sections, and below it otherwise. Drag the line between them to resize.</li>
          <li>If a bill has several scans, the numbered buttons switch between them. <span className="mono">⤢</span> or double-clicking the scan opens it larger; for PDFs, clicking the percentage fits it to the width.</li>
          <li>The <b>coloured bar</b> shows where the claim total went: what the plan paid, discounts, other payers, and what you owe.</li>
          <li><b>Amounts</b> and <b>Details</b> only list fields that have something in them (or that have a control button).</li>
          <li>The <b>Controls</b> button in the header is where you make your own buttons. See <i>Controls</i>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "controls",
    title: "Controls",
    body: (
      <>
        <p>Controls are your own buttons that do repetitive edits in one click. They appear in the <b>Viewer</b>, next to the fields you pick, and act on the bill you're looking at.</p>
        <p className="help-eg">Example: a <b>Paid this month</b> button next to <i>Due</i> that subtracts $50 from <i>Due · Amount</i>, moves <i>Due · Date</i> ahead 1 month, and greys out <i>Due</i> once the amount reaches $0.</p>
        <h4 className="label">Making one</h4>
        <ol>
          <li>Click <b>Controls</b> in the Viewer header, then <b>+ New control</b>.</li>
          <li>Name the button.</li>
          <li><b>Show the button next to</b>: pick one or more fields. With none picked, the button doesn't show anywhere.</li>
          <li>Add one or more <b>steps</b>. Each is either:
            <ul>
              <li><b>Change a value</b>: for amounts and numbers, <i>subtract</i>, <i>add</i> or <i>set to</i>; for dates, <i>move by</i> some days/weeks/months/years (a minus number moves back) or <i>set to today</i>; for any field, <i>set to</i>, <i>copy from</i> another field, or <i>clear</i>.</li>
              <li><b>Grey out / hide</b> a field in the Viewer for this bill. <i>Toggle</i> switches it back and forth each click; <i>Show normally</i> undoes it.</li>
            </ul>
          </li>
          <li>Optionally tick <b>Ask before running</b> for buttons you don't want to hit by accident.</li>
        </ol>
        <h4 className="label">How steps run</h4>
        <ul>
          <li>Steps run <b>top to bottom</b>, and each step sees the result of the ones before it.</li>
          <li><b>+ Only if…</b> adds a condition to a step; it's skipped unless every condition is true <i>at that point</i>. So a step under “subtract $50” that checks “Amount is less than $1” sees the amount after the subtraction.</li>
          <li>For dates, a condition can compare with <b>Today</b>, which means the day you click the button.</li>
          <li>Adding to or subtracting from a blank amount treats it as $0. Moving a blank date does nothing.</li>
          <li>Moving by months keeps the day of the month where it can: Jan 31 + 1 month is Feb 28.</li>
        </ul>
        <h4 className="label">After clicking</h4>
        <ul>
          <li>A bar at the top of the summary says what ran, with <b>Undo</b> for about 8 seconds. If nothing changed because the conditions weren't met, it tells you that instead.</li>
          <li>Greying out and hiding only affect the Viewer; the Inspector always shows everything. <b>Show all normally</b> at the bottom of the summary brings hidden fields back.</li>
          <li>A <span className="mono">⚠</span> on a control means it uses a field that was deleted. Open it and pick another field.</li>
        </ul>
        <h4 className="label">You owe</h4>
        <ul>
          <li><b>You owe</b> is the one built-in control. It has no button; it sets which values add up to the <b>You owe</b> amount at the top of the Viewer. By default that's just <b>Your Responsibility</b>.</li>
          <li>Open it from <b>Controls</b> and add money or number fields with <span className="mono">+</span> or <span className="mono">−</span>, e.g. Your Responsibility − Paid by Another Source. Blank values count as $0; if all of them are blank, You owe shows <span className="mono">—</span>.</li>
          <li><b>Reset to default</b> puts it back to just Your Responsibility. It can't be deleted.</li>
        </ul>
      </>
    ),
  },
  {
    id: "totals",
    title: "Totals",
    body: (
      <>
        <p>The Totals panel shows cards that add up your bills. Click a card to edit it, drag its <span className="mono">⠿</span> to reorder, and use <b>+ Total</b> to make a new one. Hover a card to see its formula.</p>
        <h4 className="label">Making one</h4>
        <ol>
          <li><b>Name</b> it, and choose whether it covers <b>All bills</b> or <b>Only</b> one category.</li>
          <li><b>Start with</b> a calculation:
            <ul>
              <li><b>Sum</b>: adds up a field across the bills.</li>
              <li><b>Count</b>: how many bills there are.</li>
              <li><b>Average</b>, <b>Lowest</b>, <b>Highest</b>: of a field. Blank values are left out.</li>
            </ul>
          </li>
          <li><b>+ Only count some bills…</b> limits that calculation to bills where a field <i>is</i> / <i>is not</i> a value, or <i>is filled in</i> / <i>is empty</i>. For example, Count of bills where Status is not “Paid”.</li>
          <li><b>+ Add a step</b> combines it with another calculation or a plain number using <span className="mono">+ − × ÷</span>. Each step can have its own “only count some bills” condition.</li>
          <li><b>Show as</b> money or a plain number. It's picked for you based on the fields used, but you can change it.</li>
        </ol>
        <p>The preview at the top shows the formula, the current numbers in it, and the result as you build it.</p>
        <h4 className="label">Things to know</h4>
        <ul>
          <li>Steps are worked out <b>top to bottom</b>, like a calculator, not with maths precedence. <span className="mono">A + B × 2</span> means <span className="mono">(A + B) × 2</span>; the formula adds brackets to show this.</li>
          <li>A plain number added or subtracted on a money total is in <b>dollars</b>. Multiplying or dividing by a number is just a factor (e.g. <span className="mono">× 0.2</span> for 20%).</li>
          <li><span className="mono">—</span> means there's no answer: an average, lowest or highest with no bills to look at, or dividing by zero.</li>
          <li>Red numbers are negative.</li>
          <li>A <span className="mono">⚠</span> means the total uses a field that was deleted. Click it to fix.</li>
        </ul>
      </>
    ),
  },
  {
    id: "filters",
    title: "Filters",
    body: (
      <>
        <p>The <b>filter row</b> under the Bills header narrows the list. Click a chip to filter; click it again, or <b>All</b>, to clear. The number on each chip is how many bills match.</p>
        <ul>
          <li>There's one chip per <b>status</b>, always there.</li>
          <li><b>＋ Filter</b> makes your own. Add conditions such as “Member Name is Ann” and “Status is not Paid”. A bill has to meet <b>all</b> of them to show.</li>
          <li><b>Double-click</b> one of your own chips to edit or delete it.</li>
          <li>The <b>Filters</b> button in the Bills header lets you hide the filter row, manage your filters and edit the status list. It's highlighted while a filter is on.</li>
          <li>Filters and search work together: the list shows bills that match both.</li>
        </ul>
      </>
    ),
  },
  {
    id: "schedule",
    title: "Schedule",
    body: (
      <>
        <p>The Schedule is a calendar of the whole year showing dates you've chosen to track, like due dates or follow-ups.</p>
        <ul>
          <li>Nothing shows up on its own. In the Inspector, click the <b>calendar icon</b> next to a bill's date to put it on the Schedule.</li>
          <li>Highlighted days have something on them; a small number means more than one. Hover a day to see what's there.</li>
          <li><b>Click a day</b> to list its entries in the Inspector, then click an entry to open that bill. Click the day again, or <span className="mono">✕</span>, to go back.</li>
          <li><span className="mono">‹ ›</span> and the year menu change the year; <b>Today</b> jumps back to now.</li>
        </ul>
      </>
    ),
  },
  {
    id: "import",
    title: "Importing",
    body: (
      <>
        <p><b>Import…</b> in the Bills header brings in bills from a spreadsheet (CSV, TSV, Excel, OpenDocument) or a claims export (JSON) from your insurer. You can also drop the file onto the window.</p>
        <ul>
          <li>Check which <b>row has the headings</b>. It's guessed, but some exports have a few lines of text on top.</li>
          <li>For each column, choose the field it <b>goes into</b>. Matching columns are filled in for you. Pick <i>Don't import</i> to skip one, or <i>New field</i> to make a custom field for it.</li>
          <li>Choose a <b>category</b> to put the bills in.</li>
          <li><b>Skip bills that are already in your list</b> leaves out rows with the same claim number, date and amounts as an existing bill, so importing the same file twice is safe.</li>
          <li>Check the preview, then click <b>Import</b>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "Encryption",
    body: (
      <>
        <p>Everything is stored only on this computer. Under <b>Settings</b> (the gear) you can turn on <b>encryption</b>, so your bills and scans can only be opened with a password.</p>
        <ul>
          <li><b>There's no way to recover your bills if you forget the password.</b> Write it down somewhere safe.</li>
          <li>With encryption on, the app asks for the password each time it opens. <b>Lock now</b> locks it right away.</li>
          <li>While encrypted, scans can't be opened in another app (<span className="mono">↗</span> is hidden), because that would leave an unencrypted copy on disk. Use <b>Save a copy…</b> if you need the file.</li>
        </ul>
      </>
    ),
  },
  {
    id: "updates",
    title: "Updates",
    body: (
      <>
        <p>The app can update itself from the GitHub repo it's published on. Under <b>Settings</b>, paste the repo's link (e.g. <span className="mono">github.com/you/ihatebills</span>) and click <b>Save</b>.</p>
        <ul>
          <li>With <b>Check for updates when the app opens</b> ticked, an <b>Update to …</b> button appears in the top bar when there's a new version. It opens Settings.</li>
          <li><b>Install and restart</b> downloads the new version, checks its signature, installs it and reopens the app. Your bills and settings are kept.</li>
          <li>Only versions signed with this app's key are installed, so an update from a different or tampered-with copy of the app is refused.</li>
        </ul>
      </>
    ),
  },
  {
    id: "keys",
    title: "Keyboard shortcuts",
    body: (
      <table className="help-keys">
        <tbody>
          <tr><td><K>⌘</K> <K>N</K></td><td>New bill</td></tr>
          <tr><td><K>↑</K> <K>↓</K></td><td>Select the previous / next bill</td></tr>
          <tr><td><K>Delete</K> or <K>⌫</K></td><td>Delete the selected bill (asks first)</td></tr>
          <tr><td><K>Esc</K></td><td>Close a dialog, restore a maximised panel, clear the search box, or cancel a panel drag</td></tr>
          <tr><td><K>Enter</K></td><td>Finish renaming a category or field</td></tr>
        </tbody>
      </table>
    ),
  },
];

export function HelpDialog({ onClose }: { onClose(): void }) {
  const [topic, setTopic] = useState(TOPICS[0].id);
  const t = TOPICS.find((x) => x.id === topic)!;
  return (
    <Dialog className="help" title="Instructions" onClose={onClose}>
      <nav className="help-nav">
        {TOPICS.map((x) => (
          <button key={x.id} className={x.id === topic ? "on" : ""} onClick={() => setTopic(x.id)}>{x.title}</button>
        ))}
      </nav>
      <article className="help-body" key={t.id}>
        <h3>{t.title}</h3>
        {t.body}
      </article>
    </Dialog>
  );
}
