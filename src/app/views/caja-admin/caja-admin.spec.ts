import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CajaAdmin } from './caja-admin';

describe('CajaAdmin', () => {
  let component: CajaAdmin;
  let fixture: ComponentFixture<CajaAdmin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CajaAdmin],
    }).compileComponents();

    fixture = TestBed.createComponent(CajaAdmin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
